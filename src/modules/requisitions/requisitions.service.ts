import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, IsNull, Repository } from 'typeorm';
import {
  DepartmentEntity, RequisitionApprovalEntity, RequisitionEntity, RequisitionItemEntity, RequisitionStatus,
} from './entities/requisition.entity';
import { CreateRequisitionDto, DepartmentDto, PayRequisitionDto, PriceRequisitionDto, RequisitionDecisionDto } from './dto/requisitions.dto';
import { AssetEntity } from '../administration/entities/asset.entity';
import { BudgetLineEntity } from '../finance-ifrs17/entities/budget-line.entity';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { UserEntity } from '../identity-access/entities/user.entity';
import { EmployeeEntity } from '../hr/entities/employee.entity';
import { JournalService } from '../finance-ifrs17/journal.service';
import { ChartOfAccountEntity } from '../finance-ifrs17/entities/chart-of-account.entity';

const r2 = (n: number) => Math.round(n * 100) / 100;

/** The approval chain, in order, with the role that signs each step (the department head is a person, not a role). */
const CHAIN: { status: RequisitionStatus; stage: string; role: string | null }[] = [
  { status: 'Pending Department Head', stage: 'Department Head', role: null },
  { status: 'Pending Procurement Manager', stage: 'Procurement Manager', role: 'Procurement Manager' },
  { status: 'Pending Finance Manager', stage: 'Finance Manager', role: 'Finance Manager' },
  { status: 'Pending Managing Director', stage: 'Managing Director', role: 'Managing Director' },
  { status: 'Pending CEO', stage: 'CEO', role: 'CEO' },
];
const PENDING = CHAIN.map((c) => c.status);

/**
 * When the person who raised a requisition holds the role for a step, someone else signs it:
 *  - Procurement Manager or Finance Manager raising their own: the Finance Director signs that step.
 *  - Managing Director or CEO raising their own: their own step is recorded as signed by them
 *    (their request is their authority), and every other step still applies.
 */
const STAND_IN: Record<string, string> = { 'Procurement Manager': 'Finance Director', 'Finance Manager': 'Finance Director' };
const SELF_SIGN_ROLES = ['Managing Director', 'CEO'];

/** Roles that see every requisition (others see their own and their department's). */
const SEE_ALL_ROLES = ['Supreme Admin', 'Super Admin', 'Procurement Manager', 'Finance Manager', 'Finance Director', 'Managing Director', 'CEO', 'Internal Auditor'];
export const PAY_ROLES = ['Finance Manager', 'Finance Director', 'Super Admin', 'Supreme Admin'];
export const DEPARTMENT_ADMIN_ROLES = ['Super Admin', 'Supreme Admin', 'HR Manager'];
const CASH_ACCOUNT: Record<string, string> = { Cash: '1000', Bank: '1010', 'Mobile Money': '1020' };

@Injectable()
export class RequisitionsService {
  constructor(
    @InjectRepository(RequisitionEntity) private readonly reqRepo: Repository<RequisitionEntity>,
    @InjectRepository(RequisitionItemEntity) private readonly itemRepo: Repository<RequisitionItemEntity>,
    @InjectRepository(RequisitionApprovalEntity) private readonly apprRepo: Repository<RequisitionApprovalEntity>,
    @InjectRepository(DepartmentEntity) private readonly deptRepo: Repository<DepartmentEntity>,
    @InjectRepository(UserEntity) private readonly usersRepo: Repository<UserEntity>,
    @InjectRepository(EmployeeEntity) private readonly employeesRepo: Repository<EmployeeEntity>,
    @InjectRepository(ChartOfAccountEntity) private readonly accountsRepo: Repository<ChartOfAccountEntity>,
    @InjectRepository(AssetEntity) private readonly assetsRepo: Repository<AssetEntity>,
    @InjectRepository(BudgetLineEntity) private readonly budgetRepo: Repository<BudgetLineEntity>,
    private readonly journalService: JournalService,
    private readonly dataSource: DataSource,
  ) {}

  // ------------------------------------------------------------------ departments

  async departments() {
    const depts = await this.deptRepo.find({ order: { name: 'ASC' } });
    const heads = await this.userNames(depts.map((d) => d.headUserId).filter(Boolean) as string[]);
    const counts: { department: string; n: string }[] = await this.employeesRepo
      .createQueryBuilder('e').select('lower(trim(e.department))', 'department').addSelect('COUNT(*)', 'n')
      .where("e.status <> 'Exited'").groupBy('lower(trim(e.department))').getRawMany();
    const byName = new Map(counts.map((c) => [c.department, Number(c.n)]));
    return depts.map((d) => ({ ...d, headName: d.headUserId ? heads.get(d.headUserId) ?? null : null, staffCount: byName.get(d.name.trim().toLowerCase()) ?? 0 }));
  }

  /** Removes a department nobody uses. One with staff or requisitions is switched off instead, so history keeps its name. */
  async deleteDepartment(id: string) {
    const d = await this.deptRepo.findOne({ where: { id } });
    if (!d) throw new NotFoundException('Department not found.');
    const staff = await this.employeesRepo.count({ where: { department: d.name } });
    const reqs = await this.reqRepo.count({ where: { departmentId: id } });
    if (staff || reqs) {
      const active = await this.employeesRepo.count({ where: { department: d.name, status: In(['Active', 'On Leave']) } });
      if (active) throw new BadRequestException(`${d.name} still has ${active} staff member${active === 1 ? '' : 's'}. Move them to another department first.`);
      await this.deptRepo.update(id, { active: false, headUserId: null });
      return { deleted: false, deactivated: true, name: d.name };
    }
    await this.deptRepo.delete(id);
    return { deleted: true, name: d.name };
  }

  async saveDepartment(dto: DepartmentDto, id?: string) {
    if (dto.headUserId) {
      const u = await this.usersRepo.findOne({ where: { id: dto.headUserId } });
      if (!u) throw new BadRequestException('That person was not found.');
    }
    const name = dto.name.trim();
    const clash = await this.deptRepo.findOne({ where: { name } });
    if (clash && clash.id !== id) throw new BadRequestException(`There is already a department called ${name}.`);
    if (id) {
      const d = await this.deptRepo.findOne({ where: { id } });
      if (!d) throw new NotFoundException('Department not found.');
      if ((dto.active === false) && d.active) {
        const active = await this.employeesRepo.count({ where: { department: d.name, status: In(['Active', 'On Leave']) } });
        if (active) throw new BadRequestException(`${d.name} still has ${active} staff member${active === 1 ? '' : 's'}. Move them to another department first.`);
      }
      await this.deptRepo.update(id, { name, headUserId: dto.headUserId === undefined ? d.headUserId : dto.headUserId, active: dto.active ?? d.active });
      // A renamed department carries its staff with it.
      if (name !== d.name) await this.employeesRepo.update({ department: d.name }, { department: name });
      return this.deptRepo.findOneOrFail({ where: { id } });
    }
    return this.deptRepo.save(this.deptRepo.create({ name, headUserId: dto.headUserId ?? null, active: dto.active ?? true }));
  }

  /** Active staff, for choosing department heads. */
  async staff() {
    const users = await this.usersRepo.find({ where: { status: 'Active' as any }, order: { fullName: 'ASC' } });
    return users.map((u) => ({ id: u.id, fullName: u.fullName, role: u.role?.name ?? '' }));
  }

  private async userNames(ids: string[]): Promise<Map<string, string>> {
    if (!ids.length) return new Map();
    const users = await this.usersRepo.find({ where: { id: In([...new Set(ids)]) } });
    return new Map(users.map((u) => [u.id, u.fullName]));
  }

  /** The person's own department (from their staff record) and the departments they head. */
  async me(actor: AuthenticatedUser) {
    const emp = await this.employeesRepo.findOne({ where: { userId: actor.id } });
    const depts = await this.deptRepo.find({ where: { active: true }, order: { name: 'ASC' } });
    const own = emp ? depts.find((d) => d.name.toLowerCase() === String(emp.department || '').trim().toLowerCase()) : null;
    return {
      departmentId: own?.id ?? null,
      designation: emp?.jobTitle ?? null,
      heads: depts.filter((d) => d.headUserId === actor.id).map((d) => ({ id: d.id, name: d.name })),
    };
  }

  settings() {
    return this.accountsRepo.find({ order: { code: 'ASC' } }).then((accounts) => ({
      chain: CHAIN.map((c) => c.stage),
      paymentMethods: Object.keys(CASH_ACCOUNT),
      // Office purchases are an expense, or a fixed asset for equipment.
      expenseAccounts: accounts.filter((a) => a.type === 'Expense' || a.code === '1500').map((a) => ({ code: a.code, name: a.name })),
      defaultExpenseAccount: '5300',
    }));
  }

  // ------------------------------------------------------------------ reading

  private canSeeAll(actor: AuthenticatedUser) {
    return SEE_ALL_ROLES.includes(actor.role);
  }

  private async headedDepartmentIds(userId: string): Promise<string[]> {
    return (await this.deptRepo.find({ where: { headUserId: userId } })).map((d) => d.id);
  }

  /** What this person may do with this requisition at its current stage. */
  /**
   * People already involved in this round of signing, by role: the raiser and everyone who has
   * approved since it was last sent in. A role holder who is already involved (for example the
   * Finance Manager who heads the Finance department and signed as its head) does not sign again.
   */
  private async involved(r: RequisitionEntity): Promise<Map<string, { id: string; name: string; how: string }>> {
    const approvals = r.approvals ?? (await this.apprRepo.find({ where: { requisition: { id: r.id } } }));
    const since = this.sinceLastSubmission(approvals).filter((x) => x.decision === 'Approved');
    const users = await this.usersRepo.find({ where: { id: In([...new Set(since.map((x) => x.userId))].concat(r.raisedBy)) } });
    const roleOf = new Map(users.map((u) => [u.id, u.role?.name ?? '']));
    const out = new Map<string, { id: string; name: string; how: string }>();
    if (r.raisedByRole) out.set(r.raisedByRole, { id: r.raisedBy, name: r.raisedByName, how: 'raised it' });
    for (const x of since) {
      const role = roleOf.get(x.userId);
      if (role && !out.has(role)) out.set(role, { id: x.userId, name: x.userName, how: `signed as ${x.stage === 'Department Head' ? 'head of department' : x.stage}` });
    }
    return out;
  }

  async waitingOn(r: RequisitionEntity, actor: AuthenticatedUser): Promise<boolean> {
    const step = CHAIN.find((c) => c.status === r.status);
    if (!step) return false;
    if (actor.role === 'Supreme Admin') return true;
    if (step.role === null) {
      if (!r.departmentId) return false;
      const d = await this.deptRepo.findOne({ where: { id: r.departmentId } });
      return !!d && d.headUserId === actor.id;
    }
    if (STAND_IN[step.role] && (await this.involved(r)).has(step.role)) return actor.role === STAND_IN[step.role];
    return actor.role === step.role;
  }

  /** Who signs this step, in words. */
  private async signerFor(r: RequisitionEntity, step: (typeof CHAIN)[number]): Promise<string> {
    if (!step.role) return `the head of ${r.departmentName}`;
    const inv = STAND_IN[step.role] ? (await this.involved(r)).get(step.role) : undefined;
    if (inv) return `the ${STAND_IN[step.role]} (standing in, as the ${step.role} ${inv.how})`;
    return `the ${step.role}`;
  }

  /**
   * Moves the requisition to a step. A Managing Director or CEO step is recorded straight away
   * when that person raised the requisition or has already signed it as head of department.
   */
  private async moveTo(r: RequisitionEntity, idx: number): Promise<RequisitionStatus> {
    while (idx < CHAIN.length && CHAIN[idx].role && SELF_SIGN_ROLES.includes(CHAIN[idx].role!)) {
      const step = CHAIN[idx];
      const inv = (await this.involved({ ...r, approvals: undefined } as any)).get(step.role!);
      if (!inv) break;
      await this.sign(r, step.stage, 'Approved', { id: inv.id, fullName: inv.name, role: step.role! } as AuthenticatedUser, `Recorded automatically: the ${step.role} ${inv.how}.`, step.role);
      idx++;
    }
    return idx < CHAIN.length ? CHAIN[idx].status : 'Approved';
  }

  async list(actor: AuthenticatedUser, scope: 'mine' | 'waiting' | 'all' = 'all', status?: string) {
    const qb = this.reqRepo.createQueryBuilder('r').leftJoinAndSelect('r.items', 'i').orderBy('r.createdAt', 'DESC').addOrderBy('i.lineNo', 'ASC');
    if (status) qb.andWhere('r.status = :status', { status });
    const headed = await this.headedDepartmentIds(actor.id);
    if (scope === 'mine') qb.andWhere('r.raisedBy = :me', { me: actor.id });
    else if (!this.canSeeAll(actor)) {
      // Own requisitions, their department's (if they are its head), and any they have signed.
      qb.andWhere(`(r.raisedBy = :me ${headed.length ? 'OR r.departmentId IN (:...headed)' : ''} OR r.id IN (SELECT a."requisitionId" FROM requisition_approvals a WHERE a."userId" = :me))`, { me: actor.id, headed });
    }
    let rows = await qb.getMany();
    if (scope === 'waiting') {
      const out = [];
      for (const r of rows) if (await this.waitingOn(r, actor)) out.push(r);
      rows = out;
    }
    const flagged = [];
    for (const r of rows) flagged.push({ ...r, waitingOnMe: await this.waitingOn(r, actor) });
    return flagged;
  }

  async findOne(id: string, actor: AuthenticatedUser) {
    const r = await this.reqRepo.findOne({ where: { id }, relations: ['items', 'approvals'] });
    if (!r) throw new NotFoundException('Requisition not found.');
    if (!this.canSeeAll(actor) && r.raisedBy !== actor.id) {
      const headed = await this.headedDepartmentIds(actor.id);
      const signed = r.approvals.some((a) => a.userId === actor.id);
      if (!signed && !(r.departmentId && headed.includes(r.departmentId))) throw new ForbiddenException('You cannot open this requisition.');
    }
    r.items.sort((a, b) => a.lineNo - b.lineNo);
    r.approvals.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
    const waitingOnMe = await this.waitingOn(r, actor);
    const dept = r.departmentId ? await this.deptRepo.findOne({ where: { id: r.departmentId } }) : null;
    const headName = dept?.headUserId ? (await this.userNames([dept.headUserId])).get(dept.headUserId) ?? null : null;
    return {
      ...r,
      waitingOnMe,
      departmentHeadName: headName,
      canEdit: r.raisedBy === actor.id && r.status === 'Returned',
      canCancel: r.raisedBy === actor.id && (PENDING.includes(r.status) || r.status === 'Returned'),
      canPrice: waitingOnMe && r.status === 'Pending Procurement Manager',
      canPay: r.status === 'Approved' && PAY_ROLES.includes(actor.role),
      canReceive: r.status === 'Paid' && !r.receivedAt && (r.raisedBy === actor.id || ['Procurement Manager', 'Supreme Admin', 'Super Admin'].includes(actor.role)),
      canChooseAccount: waitingOnMe && ['Pending Procurement Manager', 'Pending Finance Manager'].includes(r.status),
      budget: [...PENDING, 'Approved'].includes(r.status) && (this.canSeeAll(actor) || waitingOnMe) ? await this.budgetCheck(r) : null,
      chain: CHAIN.map((c) => c.stage),
      currentSigner: await (async () => { const st = CHAIN.find((c) => c.status === r.status); return st ? this.signerFor(r, st) : null; })(),
    };
  }

  /** Counts for the menu and the task inbox. */
  async summary(actor: AuthenticatedUser) {
    const waiting = await this.list(actor, 'waiting');
    const mine = await this.reqRepo.count({ where: { raisedBy: actor.id, status: 'Returned' } });
    const toPay = PAY_ROLES.includes(actor.role) ? await this.reqRepo.count({ where: { status: 'Approved' } }) : 0;
    const toReceive = await this.reqRepo.count({ where: { raisedBy: actor.id, status: 'Paid', receivedAt: IsNull() } });
    return { waitingOnMe: waiting.length, returnedToMe: mine, toPay, toReceive };
  }

  // ------------------------------------------------------------------ raising

  private async nextRef(): Promise<string> {
    const prefix = `REQ-${new Date().getFullYear()}-`;
    const row = await this.reqRepo
      .createQueryBuilder('r')
      .select(`MAX(CAST(SUBSTRING(r.ref FROM ${prefix.length + 1}) AS int))`, 'max')
      .where('r.ref LIKE :p', { p: `${prefix}%` })
      .getRawOne<{ max: number | null }>();
    return `${prefix}${String((Number(row?.max) || 0) + 1).padStart(4, '0')}`;
  }

  private buildItems(items: CreateRequisitionDto['items']) {
    return items.map((it, i) => {
      const qty = Number(it.quantity);
      const unit = Number(it.unitCost ?? 0);
      return { lineNo: i + 1, description: it.description.trim(), quantity: qty.toFixed(2), unitCost: unit.toFixed(2), totalCost: r2(qty * unit).toFixed(2) };
    });
  }

  private sign(r: { id: string }, stage: string, decision: string, actor: AuthenticatedUser, comment?: string | null, designation?: string | null) {
    return this.apprRepo.save(
      this.apprRepo.create({ requisition: { id: r.id } as any, stage, decision, userId: actor.id, userName: actor.fullName || 'Staff', designation: designation ?? actor.role, comment: comment?.trim() || null }),
    );
  }

  /**
   * Sends a requisition into the chain. If the person raising it heads the department,
   * or the department has no head set, the department step is passed and noted.
   */
  private async enterChain(r: RequisitionEntity, actor: AuthenticatedUser) {
    const dept = r.departmentId ? await this.deptRepo.findOne({ where: { id: r.departmentId } }) : null;
    let status: RequisitionStatus = 'Pending Department Head';
    if (dept?.headUserId === actor.id) {
      await this.sign(r, 'Department Head', 'Approved', actor, 'Raised by the head of department.', 'Head of ' + dept.name);
      status = await this.moveTo(r, 1);
    } else if (!dept?.headUserId) {
      await this.sign(r, 'Department Head', 'Skipped', actor, `No head is set for ${r.departmentName}, so this went straight to procurement.`, null);
      status = await this.moveTo(r, 1);
    }
    await this.reqRepo.update(r.id, { status, submittedAt: new Date(), lastActionStage: null });
  }

  async create(dto: CreateRequisitionDto, actor: AuthenticatedUser) {
    const dept = await this.deptRepo.findOne({ where: { id: dto.departmentId } });
    if (!dept || !dept.active) throw new BadRequestException('Choose your department.');
    const items = this.buildItems(dto.items);
    const total = r2(items.reduce((s, i) => s + Number(i.totalCost), 0));
    for (let attempt = 0; ; attempt++) {
      try {
        const saved = await this.dataSource.transaction(async (m) => {
          const r = await m.save(RequisitionEntity, m.create(RequisitionEntity, {
            ref: await this.nextRef(),
            purpose: dto.purpose.trim(),
            departmentId: dept.id,
            departmentName: dept.name,
            raisedBy: actor.id,
            raisedByName: actor.fullName || 'Staff',
            raisedByRole: actor.role,
            designation: dto.designation?.trim() || null,
            neededBy: dto.neededBy || null,
            urgency: dto.urgency ?? 'Normal',
            supplier: dto.supplier?.trim() || null,
            total: total.toFixed(2),
            status: 'Pending Department Head',
          }));
          for (const it of items) await m.save(RequisitionItemEntity, m.create(RequisitionItemEntity, { ...it, requisition: r }));
          await m.save(RequisitionApprovalEntity, m.create(RequisitionApprovalEntity, {
            requisition: r, stage: 'Raised', decision: 'Submitted', userId: actor.id, userName: actor.fullName || 'Staff', designation: dto.designation?.trim() || actor.role, comment: null,
          }));
          return r;
        });
        await this.enterChain(saved, actor);
        return this.findOne(saved.id, actor);
      } catch (e: any) {
        if (e?.code === '23505' && attempt < 4) continue;
        throw e;
      }
    }
  }

  /** The raiser corrects a returned requisition and sends it again from the start of the chain. */
  async resubmit(id: string, dto: CreateRequisitionDto, actor: AuthenticatedUser) {
    const r = await this.reqRepo.findOne({ where: { id } });
    if (!r) throw new NotFoundException('Requisition not found.');
    if (r.raisedBy !== actor.id) throw new ForbiddenException('Only the person who raised it can change it.');
    if (r.status !== 'Returned') throw new BadRequestException('Only a returned requisition can be changed.');
    const dept = await this.deptRepo.findOne({ where: { id: dto.departmentId } });
    if (!dept || !dept.active) throw new BadRequestException('Choose your department.');
    const items = this.buildItems(dto.items);
    const total = r2(items.reduce((s, i) => s + Number(i.totalCost), 0));
    await this.dataSource.transaction(async (m) => {
      await m.delete(RequisitionItemEntity, { requisition: { id } });
      for (const it of items) await m.save(RequisitionItemEntity, m.create(RequisitionItemEntity, { ...it, requisition: { id } as any }));
      await m.update(RequisitionEntity, id, {
        purpose: dto.purpose.trim(), departmentId: dept.id, departmentName: dept.name, designation: dto.designation?.trim() || null,
        neededBy: dto.neededBy || null, urgency: dto.urgency ?? 'Normal', supplier: dto.supplier?.trim() || null, total: total.toFixed(2),
      });
    });
    await this.sign(r, 'Raised', 'Resubmitted', actor, null, dto.designation?.trim() || actor.role);
    await this.enterChain({ ...r, departmentId: dept.id, departmentName: dept.name } as RequisitionEntity, actor);
    return this.findOne(id, actor);
  }

  async cancel(id: string, comment: string | undefined, actor: AuthenticatedUser) {
    const r = await this.reqRepo.findOne({ where: { id } });
    if (!r) throw new NotFoundException('Requisition not found.');
    if (r.raisedBy !== actor.id) throw new ForbiddenException('Only the person who raised it can cancel it.');
    if (!(PENDING.includes(r.status) || r.status === 'Returned')) throw new BadRequestException(`A requisition that is ${r.status} cannot be cancelled.`);
    await this.reqRepo.update(id, { status: 'Cancelled' });
    await this.sign(r, 'Raised', 'Cancelled', actor, comment, null);
    return this.findOne(id, actor);
  }

  // ------------------------------------------------------------------ approving

  /** The Procurement Manager sets prices (and can correct quantities) before approving. */
  async price(id: string, dto: PriceRequisitionDto, actor: AuthenticatedUser) {
    const r = await this.reqRepo.findOne({ where: { id }, relations: ['items'] });
    if (!r) throw new NotFoundException('Requisition not found.');
    if (r.status !== 'Pending Procurement Manager' || !(await this.waitingOn(r, actor))) {
      throw new ForbiddenException('Prices are set by the Procurement Manager while the requisition is with them.');
    }
    const byId = new Map(r.items.map((i) => [i.id, i]));
    for (const p of dto.items) {
      const it = byId.get(p.id);
      if (!it) throw new BadRequestException('One of the lines does not belong to this requisition.');
      const qty = p.quantity ?? Number(it.quantity);
      await this.itemRepo.update(it.id, { unitCost: p.unitCost.toFixed(2), quantity: qty.toFixed(2), totalCost: r2(qty * p.unitCost).toFixed(2) });
    }
    const items = await this.itemRepo.find({ where: { requisition: { id } } });
    const total = r2(items.reduce((s, i) => s + Number(i.totalCost), 0));
    if (dto.chargeAccount) await this.assertChargeAccount(dto.chargeAccount);
    await this.reqRepo.update(id, {
      total: total.toFixed(2),
      ...(dto.supplier !== undefined ? { supplier: dto.supplier.trim() || null } : {}),
      ...(dto.chargeAccount ? { expenseAccount: dto.chargeAccount } : {}),
    });
    return this.findOne(id, actor);
  }

  async decide(id: string, dto: RequisitionDecisionDto, actor: AuthenticatedUser) {
    const r = await this.reqRepo.findOne({ where: { id }, relations: ['items', 'approvals'] });
    if (!r) throw new NotFoundException('Requisition not found.');
    const idx = CHAIN.findIndex((c) => c.status === r.status);
    if (idx < 0) throw new BadRequestException(`This requisition is ${r.status} and is not waiting for a signature.`);
    const step = CHAIN[idx];
    if (!(await this.waitingOn(r, actor))) {
      throw new ForbiddenException(`This step is signed by ${await this.signerFor(r, step)}.`);
    }
    // Separation of duties: nobody approves their own requisition, or signs the same one twice.
    if (dto.decision === 'Approved' && actor.role !== 'Supreme Admin') {
      if (r.raisedBy === actor.id) throw new ForbiddenException('You raised this requisition, so someone else must approve it.');
      const since = this.sinceLastSubmission(r.approvals);
      if (since.some((a) => a.userId === actor.id && a.decision === 'Approved')) throw new ForbiddenException('You have already signed this requisition at another step.');
    }
    if (dto.decision !== 'Approved' && !dto.comment?.trim()) {
      throw new BadRequestException(dto.decision === 'Returned' ? 'Say what needs to change.' : 'Give the reason for rejecting.');
    }
    if (dto.decision === 'Approved' && step.stage === 'Procurement Manager') {
      const unpriced = r.items.filter((i) => !(Number(i.unitCost) > 0));
      if (unpriced.length) throw new BadRequestException(`Set the unit cost for every line first (${unpriced.map((i) => `line ${i.lineNo}`).join(', ')}).`);
    }
    const standIn = step.role && STAND_IN[step.role] && actor.role === STAND_IN[step.role] && actor.role !== step.role;
    if (dto.chargeAccount && ['Procurement Manager', 'Finance Manager'].includes(step.stage)) {
      await this.assertChargeAccount(dto.chargeAccount);
      await this.reqRepo.update(id, { expenseAccount: dto.chargeAccount });
    }
    const designation = !step.role ? `Head of ${r.departmentName}` : standIn ? `${actor.role}, for the ${step.role}` : step.role;
    await this.sign(r, step.stage, dto.decision, actor, dto.comment, designation);
    const next: RequisitionStatus =
      dto.decision === 'Approved' ? await this.moveTo(r, idx + 1) : dto.decision === 'Returned' ? 'Returned' : 'Rejected';
    await this.reqRepo.update(id, { status: next, lastActionStage: dto.decision === 'Approved' ? null : step.stage });
    return this.findOne(id, actor);
  }

  private sinceLastSubmission(approvals: RequisitionApprovalEntity[]) {
    const sorted = [...approvals].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
    let start = 0;
    sorted.forEach((a, i) => { if (a.decision === 'Submitted' || a.decision === 'Resubmitted') start = i; });
    return sorted.slice(start);
  }

  // ------------------------------------------------------------------ budget

  private async assertChargeAccount(code: string) {
    const a = await this.accountsRepo.findOne({ where: { code } });
    if (!a || !(a.type === 'Expense' || a.code === '1500')) throw new BadRequestException('Choose an expense account (or Fixed Assets for equipment).');
    return a;
  }

  /**
   * This year's budget for the account the requisition will be charged to, what has
   * already been spent from it (the books), what other requisitions have committed,
   * and what is left after this one.
   */
  async budgetCheck(r: RequisitionEntity) {
    const code = r.expenseAccount || '5300';
    const year = String(new Date().getFullYear());
    const line = await this.budgetRepo.findOne({ where: { accountCode: code, year } });
    const account = await this.accountsRepo.findOne({ where: { code } });
    const [{ spent }] = await this.dataSource.query(
      `SELECT COALESCE(SUM(l.debit - l.credit), 0) AS spent FROM journal_lines l
       JOIN journal_entries j ON j.id = l."journalEntryId" JOIN chart_of_accounts a ON a.id = l."accountId"
       WHERE a.code = $1 AND j.date >= $2 AND j.date <= $3 AND j.status = 'Posted'`,
      [code, `${year}-01-01`, `${year}-12-31`],
    );
    // Requisitions not yet given an account count against the default account.
    const others = await this.reqRepo.find({
      where: [
        { expenseAccount: code, status: In([...PENDING, 'Approved']) },
        ...(code === '5300' ? [{ expenseAccount: IsNull(), status: In([...PENDING, 'Approved']) }] : []),
      ],
    });
    const committed = r2(others.filter((o) => o.id !== r.id).reduce((t, o) => t + Number(o.total), 0));
    const budget = line ? Number(line.budgetedAmount) : null;
    const thisOne = Number(r.total);
    const leftAfter = budget == null ? null : r2(budget - Number(spent) - committed - thisOne);
    return {
      account: code, accountName: account?.name ?? '', year, budget, spent: r2(Number(spent)), committed, thisRequisition: thisOne, leftAfter,
      overBudget: leftAfter != null && leftAfter < 0,
    };
  }

  // ------------------------------------------------------------------ report

  /**
   * Spending between two dates (by the date paid), what is signed but not yet paid,
   * and what is still going through the chain.
   */
  async report(from: string, to: string) {
    const all = await this.reqRepo.find({ order: { createdAt: 'DESC' } });
    const accounts = new Map((await this.accountsRepo.find()).map((a) => [a.code, a.name]));
    const paid = all.filter((r) => r.status === 'Paid' && r.paidOn && r.paidOn >= from && r.paidOn <= to);
    const group = (key: (r: RequisitionEntity) => string) => {
      const m = new Map<string, { key: string; count: number; amount: number }>();
      for (const r of paid) {
        const k = key(r);
        const g = m.get(k) ?? { key: k, count: 0, amount: 0 };
        g.count++; g.amount = r2(g.amount + Number(r.amountPaid || 0));
        m.set(k, g);
      }
      return [...m.values()].sort((a, b) => b.amount - a.amount);
    };
    const inChain = all.filter((r) => PENDING.includes(r.status));
    const signed = all.filter((r) => r.status === 'Approved');
    const stageCounts = CHAIN.map((c) => ({ stage: c.stage, count: inChain.filter((r) => r.status === c.status).length, amount: r2(inChain.filter((r) => r.status === c.status).reduce((t, r) => t + Number(r.total), 0)) }));
    // How long requisitions take from being raised to the CEO's signature, for those signed in the period.
    const days: number[] = [];
    for (const r of all.filter((x) => x.status === 'Paid' || x.status === 'Approved')) {
      const ap = await this.apprRepo.find({ where: { requisition: { id: r.id }, stage: 'CEO', decision: 'Approved' }, order: { at: 'DESC' } });
      const at = ap[0]?.at;
      if (at && at.toISOString().slice(0, 10) >= from && at.toISOString().slice(0, 10) <= to) days.push((at.getTime() - new Date(r.submittedAt || r.createdAt).getTime()) / 86_400_000);
    }
    return {
      from, to,
      spent: r2(paid.reduce((t, r) => t + Number(r.amountPaid || 0), 0)),
      paidCount: paid.length,
      byDepartment: group((r) => r.departmentName),
      byMonth: group((r) => String(r.paidOn).slice(0, 7)).sort((a, b) => a.key.localeCompare(b.key)),
      byAccount: group((r) => `${r.expenseAccount} ${accounts.get(r.expenseAccount || '') ?? ''}`.trim()),
      signedNotPaid: { count: signed.length, amount: r2(signed.reduce((t, r) => t + Number(r.total), 0)) },
      inChain: { count: inChain.length, amount: r2(inChain.reduce((t, r) => t + Number(r.total), 0)), byStage: stageCounts },
      averageDaysToSign: days.length ? Math.round((days.reduce((a, b) => a + b, 0) / days.length) * 10) / 10 : null,
      rows: all
        .filter((r) => { const d = (r.paidOn || r.createdAt.toISOString()).slice(0, 10); return d >= from && d <= to; })
        .map((r) => ({
          ref: r.ref, raised: r.createdAt.toISOString().slice(0, 10), department: r.departmentName, raisedBy: r.raisedByName, purpose: r.purpose,
          urgency: r.urgency, supplier: r.supplier ?? '', total: Number(r.total), status: r.status, paidOn: r.paidOn ?? '',
          amountPaid: r.amountPaid != null ? Number(r.amountPaid) : null, paymentMethod: r.paymentMethod ?? '', reference: r.paymentReference ?? '',
          account: r.expenseAccount ? `${r.expenseAccount} ${accounts.get(r.expenseAccount) ?? ''}`.trim() : '',
        })),
    };
  }

  // ------------------------------------------------------------------ paying

  /** After the CEO signs, Finance records the purchase: Dr the expense (or asset) account, Cr cash, bank or mobile money. */
  async pay(id: string, dto: PayRequisitionDto, actor: AuthenticatedUser) {
    const r = await this.reqRepo.findOne({ where: { id } });
    if (!r) throw new NotFoundException('Requisition not found.');
    if (r.status !== 'Approved') throw new BadRequestException('Only a requisition the CEO has signed can be paid.');
    const account = await this.accountsRepo.findOne({ where: { code: dto.expenseAccount } });
    if (!account || !(account.type === 'Expense' || account.code === '1500')) throw new BadRequestException('Choose an expense account (or Fixed Assets for equipment).');
    const cash = CASH_ACCOUNT[dto.paymentMethod];
    const amount = r2(dto.amount);
    const entry = await this.journalService.post(
      dto.paidOn,
      `Requisition ${r.ref} paid - ${r.purpose.slice(0, 80)}${dto.supplier || r.supplier ? ` (${dto.supplier || r.supplier})` : ''}`,
      [
        { accountCode: account.code, debit: amount, credit: 0 },
        { accountCode: cash, debit: 0, credit: amount },
      ],
      'requisitions',
      r.id,
      actor,
    );
    await this.reqRepo.update(id, {
      status: 'Paid', paidOn: dto.paidOn, amountPaid: amount.toFixed(2), paymentMethod: dto.paymentMethod, paymentReference: dto.reference?.trim() || null,
      expenseAccount: account.code, paidBy: actor.id, journalEntryId: entry.id, supplier: dto.supplier?.trim() || r.supplier,
    });
    await this.sign(r, 'Finance', 'Paid', actor, `${dto.paymentMethod}${dto.reference ? `, ref ${dto.reference}` : ''}, NLe ${amount.toFixed(2)}`, actor.role);
    if (account.code === '1500') await this.addToAssetRegister(r, amount, dto.paidOn);
    return this.findOne(id, actor);
  }

  /**
   * Equipment bought on a requisition (charged to Fixed Assets) goes into the asset register,
   * one entry per item (up to 20 of one kind; more than that is kept as one entry), at the price paid.
   * Each entry is then depreciated by the monthly depreciation run.
   */
  private async addToAssetRegister(r: RequisitionEntity, amountPaid: number, paidOn: string) {
    const items = await this.itemRepo.find({ where: { requisition: { id: r.id } }, order: { lineNo: 'ASC' } });
    const listed = items.reduce((t, i) => t + Number(i.totalCost), 0);
    const scale = listed > 0 ? amountPaid / listed : 0;
    let created = 0;
    for (const it of items) {
      const qty = Number(it.quantity);
      const lineCost = r2(Number(it.totalCost) * scale);
      const each = Number.isInteger(qty) && qty >= 1 && qty <= 20;
      const count = each ? qty : 1;
      for (let n = 0; n < count; n++) {
        const cost = each ? (n === count - 1 ? r2(lineCost - r2(lineCost / count) * (count - 1)) : r2(lineCost / count)) : lineCost;
        await this.assetsRepo.save(this.assetsRepo.create({
          name: each && count > 1 ? `${it.description} (${n + 1} of ${count})` : each ? it.description : `${it.description} x ${qty}`,
          category: 'Office equipment', assignedTo: r.departmentName, status: 'In Use',
          purchaseCost: cost.toFixed(2), purchaseDate: paidOn, usefulLifeYears: 5, accumulatedDepreciation: '0.00',
        }));
        created++;
      }
    }
    await this.reqRepo.update(r.id, { assetsCreated: created });
  }

  /** The person who raised it (or the Procurement Manager) confirms the goods arrived. */
  async receive(id: string, note: string | undefined, actor: AuthenticatedUser) {
    const r = await this.reqRepo.findOne({ where: { id } });
    if (!r) throw new NotFoundException('Requisition not found.');
    if (r.status !== 'Paid') throw new BadRequestException('Goods are confirmed once the requisition has been paid.');
    if (r.receivedAt) throw new BadRequestException('Already confirmed as received.');
    if (!(r.raisedBy === actor.id || ['Procurement Manager', 'Supreme Admin', 'Super Admin'].includes(actor.role))) {
      throw new ForbiddenException('The person who raised it or the Procurement Manager confirms receipt.');
    }
    await this.reqRepo.update(id, { receivedAt: new Date(), receivedBy: actor.id, receivedByName: actor.fullName || 'Staff', receivedNote: note?.trim() || null });
    await this.sign(r, 'Goods received', 'Received', actor, note, actor.role);
    return this.findOne(id, actor);
  }
}
