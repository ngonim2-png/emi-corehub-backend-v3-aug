import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { DomainEvents, LoanDisbursedEvent, LoanRepaymentRecordedEvent, LoanStatusChangedEvent } from '../../common/events/domain-events';
import { LOAN_CHECKLIST, LoanEntity, LoanStatus, computeLoanFigures } from './entities/loan.entity';
import { AppFileEntity } from '../client-app/entities/app-file.entity';
import { SmsLogEntity } from '../notifications/sms-log.entity';
import { businessRulesFromConfig, computePolicyStatus, isPayrollDeductionPolicy, policyMaturityMonth } from '../clients-policies/policy-status.util';
import { Money } from '../../common/utils/money.util';
import { PolicyEntity } from '../clients-policies/entities/policy.entity';
import { LoanRepaymentEntity } from './entities/loan-repayment.entity';
import { PaymentEntity } from '../field-collection-wallet/entities/payment.entity';
import { ClientEntity } from '../clients-policies/entities/client.entity';
import { CreateLoanDto, LoanAssessmentDto, LoanFinalDecisionDto, RecordLoanRepaymentDto, UpdateLoanApplicationDto } from './dto/loans.dto';

export interface UploadedLoanFile { originalname: string; mimetype: string; size: number; buffer: Buffer }
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_FILE_BYTES = 6 * 1024 * 1024;
/** Document kinds: the checklist keys, plus 'other'. */
const DOC_KINDS = [...LOAN_CHECKLIST.map((c) => c.key), 'other'];
const r2 = (n: number) => Math.round(n * 100) / 100;

/** The form's premium payment method, from how the policy is paid. */
function premiumMethodFromPolicy(method?: string | null): string | null {
  switch (method) {
    case 'Bank Transfer':
    case 'Direct Debit':
      return 'Bank Standing Order';
    case 'Cash Office Payment':
      return 'Cash Office Payment';
    case 'Mobile Money':
      return 'Mobile Money';
    case 'Token Field Collection':
      return 'Field Collection';
    default:
      return null;
  }
}
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

/** Loans still in progress: a client with one of these cannot ask for another. */
const OPEN_LOAN_STATUSES: LoanStatus[] = ['Pending Life Manager Approval', 'Pending Finance Director Approval', 'Approved', 'Disbursed'];

/** Policy statuses that mean a premium is overdue. */
const OUTSTANDING_POLICY_STATUSES = ['One Month Outstanding', 'Warning', 'Lapsed'];

export interface LoanEligibility {
  eligible: boolean;
  monthsPaid: number;
  monthsRequired: number;
  /** Plain-language reasons the client cannot borrow yet; empty when eligible. */
  reasons: string[];
  activePolicies: string[];
  openLoanRef: string | null;
  tenureOptions: number[];
  interestRatePct: number;
}

@Injectable()
export class LoansService {
  constructor(
    @InjectRepository(LoanEntity) private readonly loansRepo: Repository<LoanEntity>,
    @InjectRepository(LoanRepaymentEntity) private readonly repaymentsRepo: Repository<LoanRepaymentEntity>,
    @InjectRepository(PaymentEntity) private readonly paymentsRepo: Repository<PaymentEntity>,
    @InjectRepository(ClientEntity) private readonly clientsRepo: Repository<ClientEntity>,
    @InjectRepository(PolicyEntity) private readonly policiesRepo: Repository<PolicyEntity>,
    @InjectRepository(AppFileEntity) private readonly filesRepo: Repository<AppFileEntity>,
    @InjectRepository(SmsLogEntity) private readonly smsRepo: Repository<SmsLogEntity>,
    private readonly dataSource: DataSource,
    private readonly eventEmitter: EventEmitter2,
    private readonly config: ConfigService,
  ) {}

  get interestRatePct(): number {
    const v = Number(this.config.get('loans.interestRatePct'));
    return Number.isFinite(v) && v >= 0 ? v : 25;
  }

  get tenureOptions(): number[] {
    const v = this.config.get<number[]>('loans.tenureOptions');
    return Array.isArray(v) && v.length ? v : [6, 12];
  }

  get maxDtiPct(): number {
    const v = Number(this.config.get('loans.maxDtiPct'));
    return Number.isFinite(v) && v > 0 ? v : 40;
  }

  get requireChecklist(): boolean {
    return this.config.get('loans.requireChecklist') !== false;
  }

  get minMonthsPaid(): number {
    const v = Number(this.config.get('loans.minMonthsPaid'));
    return Number.isFinite(v) && v >= 0 ? v : 3;
  }

  /** Next LN-YYYY-#### for this year. */
  private async nextLoanRef(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `LN-${year}-`;
    const row = await this.loansRepo
      .createQueryBuilder('l')
      .select(`MAX(CAST(SUBSTRING(l."loanRef" FROM ${prefix.length + 1}) AS int))`, 'max')
      .where('l."loanRef" LIKE :p', { p: `${prefix}%` })
      .getRawOne<{ max: number | null }>();
    return `${prefix}${String((Number(row?.max) || 0) + 1).padStart(4, '0')}`;
  }

  private emitStatus(loan: LoanEntity): void {
    this.eventEmitter.emit(DomainEvents.LoanStatusChanged, {
      loanId: loan.id, loanRef: loan.loanRef, clientId: loan.client?.id, status: loan.status, amountMajor: Number(loan.principal),
      notes: loan.status === 'Approved' ? loan.conditions : loan.financeDirectorNotes || loan.lifeManagerNotes || null,
    } as LoanStatusChangedEvent);
  }

  /**
   * A client can borrow when:
   *  - at least N distinct months of premium are on record (any policy),
   *  - at least one policy is Active,
   *  - no policy has premium outstanding,
   *  - no other loan is still in progress.
   */
  async checkEligibility(clientId: string, excludeLoanId?: string): Promise<LoanEligibility> {
    const payments = await this.paymentsRepo
      .createQueryBuilder('payment')
      .innerJoin('payment.policy', 'policy')
      .where('policy."clientId" = :clientId', { clientId })
      .andWhere("payment.\"reversalStatus\" != 'Reversed'")
      .andWhere('payment.amount > 0')
      .select(['payment.policyId', 'payment.paymentMonth'])
      .getMany();
    const monthsPaid = new Set(payments.map((p) => p.paymentMonth)).size;
    const monthsRequired = this.minMonthsPaid;

    const snap = await this.policySnapshot(clientId);
    const policies = snap.rows;
    const activePolicies = policies.filter((p) => p.status === 'Active').map((p) => p.policyNo);
    const outstanding = policies.filter((p) => OUTSTANDING_POLICY_STATUSES.includes(p.status));

    const openLoans = await this.loansRepo.find({
      where: OPEN_LOAN_STATUSES.map((status) => ({ client: { id: clientId }, status })),
      order: { requestedAt: 'DESC' },
    });
    const openLoan = openLoans.find((l) => l.id !== excludeLoanId) ?? null;

    const reasons: string[] = [];
    if (monthsPaid < monthsRequired) {
      reasons.push(`${monthsPaid} month${monthsPaid === 1 ? '' : 's'} of premium on record. At least ${monthsRequired} are needed.`);
    }
    if (!activePolicies.length) {
      reasons.push(policies.length ? 'No policy is Active at the moment.' : 'No policy found for this client.');
    }
    if (outstanding.length) {
      reasons.push(`Premium outstanding on ${outstanding.map((p) => `${p.policyNo} (${p.status})`).join(', ')}.`);
    }
    if (openLoan) {
      const ref = openLoan.loanRef ? `Loan ${openLoan.loanRef}` : 'Another loan';
      reasons.push(
        openLoan.status === 'Disbursed' ? `${ref} is still being repaid. You can apply again once it is fully repaid.`
          : openLoan.status === 'Approved' ? `${ref} is approved and waiting to be paid out.`
          : `${ref} is still being reviewed.`,
      );
    }
    return {
      eligible: reasons.length === 0,
      monthsPaid,
      monthsRequired,
      reasons,
      activePolicies,
      openLoanRef: openLoan?.loanRef ?? null,
      tenureOptions: this.tenureOptions,
      interestRatePct: this.interestRatePct,
    };
  }

  async create(dto: CreateLoanDto, actor: AuthenticatedUser, via: 'Staff' | 'Client App' = 'Staff'): Promise<LoanEntity> {
    const client = await this.clientsRepo.findOne({ where: { id: dto.clientId } });
    if (!client) throw new NotFoundException('Client not found.');

    const eligibility = await this.checkEligibility(dto.clientId);
    if (!eligibility.eligible) {
      throw new BadRequestException(`This client cannot take a loan yet. ${eligibility.reasons.join(' ')}`);
    }
    if (!this.tenureOptions.includes(Number(dto.tenureMonths))) {
      throw new BadRequestException(`Choose a tenure of ${this.tenureOptions.join(' or ')} months.`);
    }
    if (dto.loanType === 'Appliance' && !dto.applianceDescription?.trim()) {
      throw new BadRequestException('Describe the appliance for an appliance loan.');
    }
    if (dto.purpose === 'Other' && !dto.purposeDetail?.trim()) {
      throw new BadRequestException('Say what the loan is for when the purpose is Other.');
    }

    const rate = this.interestRatePct;
    const { totalInterest, totalRepayable, monthlyPayment } = computeLoanFigures(dto.principal, dto.tenureMonths, rate);
    if (dto.monthlyIncome != null && dto.monthlyIncome > 0 && monthlyPayment > dto.monthlyIncome) {
      throw new BadRequestException(`The monthly payment (NLe ${monthlyPayment.toFixed(2)}) is more than the monthly income given. Choose a smaller amount or a longer tenure.`);
    }

    // Two requests at the same moment could pick the same reference; the unique index stops that, so try again.
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.saveNewLoan(client, dto, actor, via, rate, totalInterest, totalRepayable, monthlyPayment);
      } catch (e: any) {
        if (e?.code === '23505' && attempt < 4) continue;
        throw e;
      }
    }
  }

  private async saveNewLoan(
    client: ClientEntity, dto: CreateLoanDto, actor: AuthenticatedUser, via: 'Staff' | 'Client App',
    rate: number, totalInterest: number, totalRepayable: number, monthlyPayment: number,
  ): Promise<LoanEntity> {
    // Fill what the system already knows, so the applicant only adds what is new.
    const policies = await this.policiesRepo.find({ where: { client: { id: client.id } } });
    const payroll = policies.find((p) => isPayrollDeductionPolicy(p));
    const t = (v?: string | null) => (v && v.trim()) || null;
    return this.loansRepo.save(
      this.loansRepo.create({
        loanRef: await this.nextLoanRef(),
        branch: t(dto.branch),
        premiumPaymentMethod: t(dto.premiumPaymentMethod) ?? (payroll ? 'AG Payroll Deduction' : premiumMethodFromPolicy(policies[0]?.paymentMethod)),
        occupation: t(dto.occupation) ?? t(client.occupation),
        staffPinCode: t(dto.staffPinCode) ?? (payroll?.payrollPinCode ? String(payroll.payrollPinCode).trim() : null),
        monthlyIncome: dto.monthlyIncome != null ? dto.monthlyIncome.toFixed(2) : null,
        existingMonthlyDebt: dto.existingMonthlyDebt != null ? dto.existingMonthlyDebt.toFixed(2) : null,
        idType: t(dto.idType) ?? (client.nationalId ? 'National ID Card' : null),
        idNumber: t(dto.idNumber) ?? t(client.nationalId),
        idExpiry: dto.idExpiry || null,
        declarationName: t(dto.declarationName),
        declarationAcceptedAt: t(dto.declarationName) ? new Date() : null,
        checklist: {},
        requestedPrincipal: dto.principal.toFixed(2),
        requestedTenureMonths: dto.tenureMonths,
        client,
        purpose: dto.purpose ?? null,
        purposeDetail: dto.purposeDetail?.trim() || null,
        loanType: dto.loanType,
        applianceDescription: dto.loanType === 'Appliance' ? dto.applianceDescription ?? null : null,
        principal: dto.principal.toFixed(2),
        tenureMonths: dto.tenureMonths,
        interestRatePct: rate.toFixed(2),
        totalInterest: totalInterest.toFixed(2),
        totalRepayable: totalRepayable.toFixed(2),
        monthlyPayment: monthlyPayment.toFixed(2),
        status: 'Pending Life Manager Approval',
        requestedBy: actor.id,
        requestedVia: via,
      }),
    );
  }

  async findAll(status?: string, clientId?: string): Promise<LoanEntity[]> {
    const where: any = {};
    if (status) where.status = status;
    if (clientId) where.client = { id: clientId };
    return this.loansRepo.find({
      where,
      relations: ['client'],
      order: { requestedAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<LoanEntity> {
    const loan = await this.loansRepo.findOne({ where: { id }, relations: ['client'] });
    if (!loan) throw new NotFoundException('Loan not found.');
    return loan;
  }

  // ------------------------------------------------------------------ verification and assessment

  /** Months between two YYYY-MM keys, inclusive of the first. */
  private monthsBetween(fromKey: string, toKey: string): number {
    const [fy, fm] = fromKey.split('-').map(Number);
    const [ty, tm] = toKey.split('-').map(Number);
    return Math.max(0, (ty - fy) * 12 + (tm - fm) + 1);
  }

  /** Which checklist items apply to this loan, and which are still missing. */
  checklistStatus(loan: Pick<LoanEntity, 'checklist' | 'premiumPaymentMethod'>) {
    const payroll = loan.premiumPaymentMethod === 'AG Payroll Deduction';
    const items = LOAN_CHECKLIST.filter((c) => !c.payrollOnly || payroll).map((c) => ({ key: c.key, label: c.label, done: !!loan.checklist?.[c.key] }));
    return { items, missing: items.filter((i) => !i.done).map((i) => i.label) };
  }

  /**
   * Section 7 A of the form, worked out from the system: each policy's status and
   * outstanding premium, months as a client, and a suggested payment performance.
   */
  /**
   * Each policy's status and outstanding premium worked out now from its payments,
   * with the same rules as the rest of the system (including the AG payroll lag),
   * so a status that has not been refreshed yet cannot let a loan through.
   */
  private async policySnapshot(clientId: string) {
    const policies = await this.policiesRepo.find({ where: { client: { id: clientId } }, relations: ['product'] });
    const rules = businessRulesFromConfig(this.config);
    const nowKey = new Date().toISOString().slice(0, 7);
    let outstanding = 0;
    let monthsExpected = 0;
    let monthsCovered = 0;
    const rows: {
      policyNo: string; productName: string; status: string; monthlyPremium: number; commencementDate: string;
      payrollPinCode: string | null; paymentMethod: string; outstanding: number;
    }[] = [];
    for (const policy of policies) {
      const raw: { paymentMonth: string; total: string }[] = await this.paymentsRepo
        .createQueryBuilder('payment')
        .select('payment.paymentMonth', 'paymentMonth')
        .addSelect('COALESCE(SUM(payment.amount), 0)', 'total')
        .where('payment.policyId = :id', { id: policy.id })
        .groupBy('payment.paymentMonth')
        .getRawMany();
      const paymentsByMonth: Record<string, number> = {};
      for (const r of raw) paymentsByMonth[r.paymentMonth] = Money.fromMajor(Number(r.total)).toMinor();
      const startKey = String(policy.commencementDate || '').slice(0, 7);
      if (!/^\d{4}-\d{2}$/.test(startKey)) {
        rows.push({ policyNo: policy.policyNo, productName: policy.product?.name ?? '', status: policy.status, monthlyPremium: Number(policy.monthlyPremium), commencementDate: policy.commencementDate, payrollPinCode: policy.payrollPinCode ?? null, paymentMethod: policy.paymentMethod, outstanding: 0 });
        continue;
      }
      const computed = computePolicyStatus(
        {
          commencementMonth: startKey,
          maturityMonth: policyMaturityMonth(policy),
          monthlyPremiumMinor: Money.fromMajor(Number(policy.monthlyPremium)).toMinor(),
          paymentsByMonth,
          payrollDeduction: isPayrollDeductionPolicy(policy),
        },
        nowKey,
        rules,
      );
      const status = policy.status === 'Cancelled' ? 'Cancelled' : computed.status;
      const owed = Money.fromMinor(computed.totalOutstandingMinor).toMajor();
      if (status !== 'Cancelled' && status !== 'Matured') outstanding += owed;
      if (startKey <= nowKey && status !== 'Cancelled') {
        const expected = this.monthsBetween(startKey, nowKey);
        monthsExpected += expected;
        const premiumMinor = Money.fromMajor(Number(policy.monthlyPremium) || 0).toMinor();
        const paidMonths = Object.values(paymentsByMonth).filter((minor) => premiumMinor > 0 && minor >= premiumMinor - 1).length;
        monthsCovered += Math.min(expected, paidMonths);
      }
      rows.push({
        policyNo: policy.policyNo, productName: policy.product?.name ?? '', status, monthlyPremium: Number(policy.monthlyPremium),
        commencementDate: policy.commencementDate, payrollPinCode: policy.payrollPinCode ?? null, paymentMethod: policy.paymentMethod,
        outstanding: owed,
      });
    }
    const starts = policies.map((p) => String(p.commencementDate || '').slice(0, 7)).filter((k) => /^\d{4}-\d{2}$/.test(k) && k <= nowKey).sort();
    return {
      entities: policies, rows, outstanding: r2(outstanding), monthsExpected, monthsCovered,
      monthsAsClient: starts.length ? this.monthsBetween(starts[0], nowKey) : 0,
    };
  }

  /** Section 7 A of the form, worked out from the system. */
  async verification(loanId: string) {
    const loan = await this.findOne(loanId);
    const snap = await this.policySnapshot(loan.client.id);
    const ratio = snap.monthsExpected ? snap.monthsCovered / snap.monthsExpected : 0;
    const suggestedPerformance = ratio >= 0.95 ? 'Excellent' : ratio >= 0.8 ? 'Good' : ratio >= 0.6 ? 'Fair' : 'Poor';
    const eligibility = await this.checkEligibility(loan.client.id, loanId);
    return {
      policies: snap.rows,
      monthsAsClient: snap.monthsAsClient,
      monthsPaid: eligibility.monthsPaid,
      outstandingPremium: snap.outstanding,
      paymentRatioPct: Math.round(ratio * 100),
      suggestedPerformance,
      suggestedPolicyNo: snap.rows.find((r) => r.status === 'Active')?.policyNo ?? snap.rows[0]?.policyNo ?? null,
      eligibility,
      checklist: this.checklistStatus(loan),
      maxDtiPct: this.maxDtiPct,
    };
  }

  private assertEditable(loan: LoanEntity) {
    if (!['Pending Life Manager Approval', 'Pending Finance Director Approval', 'Deferred'].includes(loan.status)) {
      throw new BadRequestException(`The application can no longer be changed. This loan is ${loan.status}.`);
    }
  }

  /** Staff complete or correct the application and tick the document checklist. */
  async updateApplication(id: string, dto: UpdateLoanApplicationDto, actor: AuthenticatedUser): Promise<LoanEntity> {
    const loan = await this.findOne(id);
    this.assertEditable(loan);
    const patch: Partial<LoanEntity> = {};
    const t = (v?: string) => (v === undefined ? undefined : v.trim() || null);
    for (const k of ['branch', 'premiumPaymentMethod', 'occupation', 'staffPinCode', 'idType', 'idNumber'] as const) {
      const v = t(dto[k]);
      if (v !== undefined) (patch as any)[k] = v;
    }
    if (dto.idExpiry !== undefined) patch.idExpiry = dto.idExpiry || null;
    if (dto.monthlyIncome !== undefined) patch.monthlyIncome = dto.monthlyIncome.toFixed(2);
    if (dto.existingMonthlyDebt !== undefined) patch.existingMonthlyDebt = dto.existingMonthlyDebt.toFixed(2);
    if (dto.checklist) {
      const allowed = new Set(LOAN_CHECKLIST.map((c) => c.key));
      const next = { ...(loan.checklist || {}) };
      for (const [k, v] of Object.entries(dto.checklist)) if (allowed.has(k)) next[k] = !!v;
      patch.checklist = next;
    }
    if (dto.declarationSigned && !loan.declarationAcceptedAt) {
      patch.declarationAcceptedAt = new Date();
      patch.declarationName = t(dto.declarationName) || loan.client.fullName;
    }
    if (Object.keys(patch).length) await this.loansRepo.update(id, patch);
    return this.findOne(id);
  }

  /** Section 7 B: the Life Manager's credit assessment. DTI = (existing debts + new monthly payment) / income. */
  async assess(id: string, dto: LoanAssessmentDto, actor: AuthenticatedUser): Promise<LoanEntity> {
    const loan = await this.findOne(id);
    if (!['Pending Life Manager Approval', 'Deferred'].includes(loan.status)) {
      throw new BadRequestException('The assessment is done before the Life Manager decision.');
    }
    if (!this.tenureOptions.includes(Number(dto.recommendedTenureMonths))) {
      throw new BadRequestException(`Recommend a tenure of ${this.tenureOptions.join(' or ')} months.`);
    }
    const v = await this.verification(id);
    const { monthlyPayment } = computeLoanFigures(dto.recommendedAmount, dto.recommendedTenureMonths, Number(loan.interestRatePct));
    const dti = dto.verifiedMonthlyIncome > 0 ? ((dto.verifiedExistingDebt + monthlyPayment) / dto.verifiedMonthlyIncome) * 100 : null;
    await this.loansRepo.update(id, {
      policyVerified: dto.policyVerified ?? true,
      verifiedPolicyNo: dto.verifiedPolicyNo?.trim() || v.suggestedPolicyNo,
      paymentPerformance: dto.paymentPerformance ?? v.suggestedPerformance,
      monthsAsClient: v.monthsAsClient,
      outstandingPremium: v.outstandingPremium.toFixed(2),
      verifiedMonthlyIncome: dto.verifiedMonthlyIncome.toFixed(2),
      verifiedExistingDebt: dto.verifiedExistingDebt.toFixed(2),
      dtiPct: dti == null ? null : Math.min(dti, 9999).toFixed(2),
      recommendedAmount: dto.recommendedAmount.toFixed(2),
      recommendedTenureMonths: dto.recommendedTenureMonths,
      downPayment: (dto.downPayment ?? 0).toFixed(2),
      creditAssessment: dto.creditAssessment,
      assessmentComments: dto.assessmentComments?.trim() || null,
      assessedBy: actor.id,
      assessedAt: new Date(),
    });
    return this.findOne(id);
  }

  async lifeManagerDecide(id: string, decision: 'Approved' | 'Rejected' | 'Deferred', notes: string | undefined, actor: AuthenticatedUser): Promise<LoanEntity> {
    const loan = await this.findOne(id);
    if (loan.status !== 'Pending Life Manager Approval') {
      throw new ForbiddenException('This loan is not awaiting Life Manager approval.');
    }
    if (loan.requestedBy === actor.id) {
      throw new ForbiddenException('You requested this loan - it needs to be reviewed by someone else.');
    }
    if (decision === 'Approved' && !loan.assessedAt) {
      throw new BadRequestException('Complete the credit assessment before recommending this loan.');
    }
    if (decision !== 'Approved' && !notes?.trim()) {
      throw new BadRequestException(decision === 'Deferred' ? 'Say what information is still needed.' : 'Give the reason for rejecting.');
    }
    await this.loansRepo.update(id, {
      lifeManagerDecision: decision,
      lifeManagerBy: actor.id,
      lifeManagerAt: new Date(),
      lifeManagerNotes: notes?.trim() || null,
      status: decision === 'Approved' ? 'Pending Finance Director Approval' : decision === 'Deferred' ? 'Deferred' : 'Rejected',
      decisionOutcome: decision === 'Rejected' ? 'Declined' : decision === 'Deferred' ? 'Deferred' : null,
    });
    const updated = await this.findOne(id);
    this.emitStatus(updated);
    return updated;
  }

  /**
   * Section 7 C. The Finance Director can approve a smaller amount or a different
   * tenure than requested; the figures and repayment are worked out again.
   */
  async financeDirectorDecide(id: string, dto: LoanFinalDecisionDto, actor: AuthenticatedUser): Promise<LoanEntity> {
    const loan = await this.findOne(id);
    if (loan.status !== 'Pending Finance Director Approval') {
      throw new ForbiddenException('This loan is not awaiting Finance Director approval.');
    }
    if (loan.requestedBy === actor.id) {
      throw new ForbiddenException('You requested this loan - it needs to be reviewed by someone else.');
    }
    const outcome = dto.decision === 'Rejected' ? 'Declined' : (dto.decision as 'Approved' | 'Approved With Conditions' | 'Deferred' | 'Declined');
    const notes = dto.notes?.trim() || null;
    const patch: Partial<LoanEntity> = {
      financeDirectorDecision: outcome,
      financeDirectorBy: actor.id,
      financeDirectorAt: new Date(),
      financeDirectorNotes: notes,
      decisionOutcome: outcome,
    };
    if (outcome === 'Approved' || outcome === 'Approved With Conditions') {
      if (outcome === 'Approved With Conditions' && !dto.conditions?.trim()) throw new BadRequestException('Write the conditions of approval.');
      if (this.requireChecklist) {
        const { missing } = this.checklistStatus(loan);
        if (missing.length) throw new BadRequestException(`These documents are still needed before final approval: ${missing.join('; ')}.`);
      }
      const requested = Number(loan.requestedPrincipal ?? loan.principal);
      const amount = dto.approvedAmount ?? Number(loan.principal);
      const tenure = dto.approvedTenureMonths ?? loan.tenureMonths;
      if (amount > requested + 0.001) throw new BadRequestException(`The approved amount cannot be more than the NLe ${requested.toFixed(2)} requested.`);
      if (!this.tenureOptions.includes(Number(tenure))) throw new BadRequestException(`Choose a tenure of ${this.tenureOptions.join(' or ')} months.`);
      const f = computeLoanFigures(amount, tenure, Number(loan.interestRatePct));
      Object.assign(patch, {
        status: 'Approved' as LoanStatus,
        principal: amount.toFixed(2),
        tenureMonths: tenure,
        totalInterest: f.totalInterest.toFixed(2),
        totalRepayable: f.totalRepayable.toFixed(2),
        monthlyPayment: f.monthlyPayment.toFixed(2),
        conditions: outcome === 'Approved With Conditions' ? dto.conditions!.trim() : null,
      });
    } else {
      if (!notes) throw new BadRequestException(outcome === 'Deferred' ? 'Say what information is still needed.' : 'Give the reason for declining.');
      patch.status = outcome === 'Deferred' ? 'Deferred' : 'Rejected';
    }
    await this.loansRepo.update(id, patch);
    const updated = await this.findOne(id);
    this.emitStatus(updated);
    return updated;
  }

  /** A deferred loan goes back to the stage it was deferred at, once the missing information is in. */
  async reopen(id: string, actor: AuthenticatedUser): Promise<LoanEntity> {
    const loan = await this.findOne(id);
    if (loan.status !== 'Deferred') throw new BadRequestException('Only a deferred loan can be reopened.');
    const other = await this.loansRepo.findOne({ where: OPEN_LOAN_STATUSES.map((status) => ({ client: { id: loan.client.id }, status })) });
    if (other) throw new BadRequestException(`Loan ${other.loanRef} is already in progress for this client.`);
    const backTo: LoanStatus = loan.lifeManagerDecision === 'Approved' ? 'Pending Finance Director Approval' : 'Pending Life Manager Approval';
    await this.loansRepo.update(id, {
      status: backTo,
      decisionOutcome: null,
      ...(backTo === 'Pending Life Manager Approval' ? { lifeManagerDecision: null } : { financeDirectorDecision: null }),
    });
    const updated = await this.findOne(id);
    this.emitStatus(updated);
    return updated;
  }

  // ------------------------------------------------------------------ loan book

  /**
   * Every loan with what has been paid, what is left, and what is overdue.
   * An installment is overdue once its month has ended without full payment.
   */
  async book(asOf = new Date()) {
    const nowKey = asOf.toISOString().slice(0, 7);
    const loans = await this.loansRepo.find({ relations: ['client'], order: { requestedAt: 'DESC' } });
    const reps = await this.repaymentsRepo.find({ relations: ['loan'] });
    const byLoan = new Map<string, LoanRepaymentEntity[]>();
    for (const r of reps) {
      const k = r.loan?.id;
      if (!k) continue;
      if (!byLoan.has(k)) byLoan.set(k, []);
      byLoan.get(k)!.push(r);
    }
    const rows = loans.map((l) => {
      const list = (byLoan.get(l.id) || []).sort((a, b) => a.dueMonth.localeCompare(b.dueMonth));
      const paid = list.reduce((s, r) => s + Number(r.amountPaid), 0);
      const late = list.filter((r) => r.status !== 'Paid' && r.dueMonth < nowKey);
      const overdue = late.reduce((s, r) => s + Number(r.amountDue) - Number(r.amountPaid), 0);
      const booked = l.status === 'Disbursed' || l.status === 'Completed';
      const total = Number(l.totalRepayable);
      const next = list.find((r) => r.status !== 'Paid');
      return {
        id: l.id, loanRef: l.loanRef, clientId: l.client?.id, clientName: l.client?.fullName ?? '', clientPhone: l.client?.phone ?? '',
        loanType: l.loanType, purpose: l.purpose, status: l.status, requestedVia: l.requestedVia, requestedAt: l.requestedAt, disbursedAt: l.disbursedAt,
        principal: Number(l.principal), totalInterest: Number(l.totalInterest), totalRepayable: total, monthlyPayment: Number(l.monthlyPayment), tenureMonths: l.tenureMonths,
        paid: r2(paid),
        balance: booked ? r2(Math.max(0, total - paid)) : 0,
        interestEarned: booked && total > 0 ? r2(paid * (Number(l.totalInterest) / total)) : 0,
        overdueAmount: r2(overdue),
        installmentsOverdue: late.length,
        oldestOverdueMonth: late[0]?.dueMonth ?? null,
        nextDueMonth: next?.dueMonth ?? null,
        nextDueAmount: next ? r2(Number(next.amountDue) - Number(next.amountPaid)) : 0,
      };
    });
    const live = rows.filter((r) => r.status === 'Disbursed');
    const inArrears = live.filter((r) => r.overdueAmount > 0.009);
    const sum = (list: typeof rows, k: 'balance' | 'overdueAmount' | 'principal' | 'paid' | 'interestEarned') => r2(list.reduce((s, r) => s + r[k], 0));
    const year = String(asOf.getFullYear());
    const count = (st: string) => rows.filter((r) => r.status === st).length;
    return {
      asOfMonth: nowKey,
      summary: {
        activeLoans: live.length,
        outstandingBalance: sum(live, 'balance'),
        inArrears: inArrears.length,
        overdueAmount: sum(inArrears, 'overdueAmount'),
        arrearsRatePct: live.length ? Math.round((sum(inArrears, 'balance') / Math.max(1, sum(live, 'balance'))) * 1000) / 10 : 0,
        paidOutThisYear: r2(rows.filter((r) => r.disbursedAt && new Date(r.disbursedAt).getFullYear() === Number(year)).reduce((s, r) => s + r.principal, 0)),
        repaidToDate: sum(rows, 'paid'),
        interestEarnedToDate: sum(rows, 'interestEarned'),
        awaitingLifeManager: count('Pending Life Manager Approval'),
        awaitingFinanceDirector: count('Pending Finance Director Approval'),
        awaitingPayout: count('Approved'),
        deferred: count('Deferred'),
        completed: count('Completed'),
      },
      arrears: inArrears.sort((a, b) => b.overdueAmount - a.overdueAmount),
      loans: rows,
    };
  }

  // ------------------------------------------------------------------ arrears reminders

  /**
   * Writes a reminder SMS for each loan in arrears (or the ones given) into the Pending SMS
   * queue. Nothing is sent here: staff review and send them from SMS & notifications.
   * A loan that already has a reminder waiting is skipped, so this is safe to press twice.
   */
  async queueArrearsReminders(loanIds?: string[]) {
    const book = await this.book();
    const targets = book.arrears.filter((a) => !loanIds?.length || loanIds.includes(a.id));
    const monthName = (k: string) => {
      const [y, m] = k.split('-').map(Number);
      return `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]} ${y}`;
    };
    let queued = 0;
    const skipped: string[] = [];
    for (const a of targets) {
      const phone = String(a.clientPhone || '').trim();
      if (!phone) { skipped.push(`${a.loanRef}: no phone number`); continue; }
      const waiting = await this.smsRepo.findOne({ where: { relatedType: 'loan', relatedId: a.id, status: 'Pending', templateCode: 'loan_arrears' } });
      if (waiting) { skipped.push(`${a.loanRef}: a reminder is already waiting to be sent`); continue; }
      const first = String(a.clientName || '').trim().split(/\s+/)[0] || 'Client';
      const body = `Dear ${first}, your Enhanced Mutual loan ${a.loanRef} has NLe ${a.overdueAmount.toFixed(2)} overdue since ${monthName(a.oldestOverdueMonth!)}. `
        + 'Please pay at any EMI office or call +232 99 346 278. Ignore this if you have already paid.';
      await this.smsRepo.save(this.smsRepo.create({ toPhone: phone, relatedType: 'loan', relatedId: a.id, templateCode: 'loan_arrears', body, status: 'Pending' }));
      queued++;
    }
    return { queued, skipped, inArrears: book.arrears.length };
  }

  // ------------------------------------------------------------------ documents

  validateFiles(files: UploadedLoanFile[], max: number) {
    if (files.length > max) throw new BadRequestException(`You can attach at most ${max} files.`);
    for (const f of files) {
      if (!ALLOWED_MIME.includes(f.mimetype)) throw new BadRequestException('Only photos (JPG, PNG) and PDF files can be attached.');
      if (f.size > MAX_FILE_BYTES) throw new BadRequestException('One of the files is too large (limit 6 MB).');
    }
  }

  /** Stores documents for a loan. A document for a checklist item also ticks that item. */
  async addDocuments(loanId: string, files: { kind: string; file: UploadedLoanFile }[], tick = true): Promise<number> {
    const loan = await this.findOne(loanId);
    this.validateFiles(files.map((f) => f.file), 12);
    const checklist = { ...(loan.checklist || {}) };
    for (const { kind, file } of files) {
      const k = DOC_KINDS.includes(kind) ? kind : 'other';
      await this.filesRepo.save(
        this.filesRepo.create({ ownerType: 'loan', ownerId: loanId, kind: k, filename: file.originalname, mimeType: file.mimetype, sizeBytes: file.size, data: file.buffer }),
      );
      if (tick && k !== 'other') checklist[k] = true;
    }
    if (tick) await this.loansRepo.update(loanId, { checklist });
    return files.length;
  }

  async listDocuments(loanId: string) {
    const files = await this.filesRepo
      .createQueryBuilder('f')
      .select(['f.id', 'f.kind', 'f.filename', 'f.mimeType', 'f.sizeBytes', 'f.createdAt'])
      .where('f."ownerType" = :t AND f."ownerId" = :id', { t: 'loan', id: loanId })
      .orderBy('f.createdAt', 'ASC')
      .getMany();
    const labels = new Map(LOAN_CHECKLIST.map((c) => [c.key, c.label]));
    return files.map((f) => ({ id: f.id, kind: f.kind, kindLabel: labels.get(f.kind) ?? 'Other document', filename: f.filename, mimeType: f.mimeType, sizeBytes: f.sizeBytes, createdAt: f.createdAt }));
  }

  async getDocument(fileId: string) {
    const f = await this.filesRepo.findOne({ where: { id: fileId, ownerType: 'loan' } });
    if (!f) throw new NotFoundException('Document not found.');
    return f;
  }

  /** Marks the loan Disbursed and creates the full monthly repayment schedule in one transaction - both happen together or neither does. */
  async disburse(id: string, actor: AuthenticatedUser): Promise<LoanEntity> {
    const loan = await this.findOne(id);
    if (loan.status !== 'Approved') {
      throw new ForbiddenException('Only a fully-approved loan can be disbursed.');
    }
    await this.dataSource.transaction(async (manager) => {
      await manager.update(LoanEntity, id, { status: 'Disbursed', disbursedAt: new Date(), disbursedBy: actor.id });
      const startMonth = new Date();
      // Equal installments, with any rounding cents on the last one so the schedule adds up to the total exactly.
      const total = Number(loan.totalRepayable);
      const each = Math.round((total / loan.tenureMonths) * 100) / 100;
      for (let i = 0; i < loan.tenureMonths; i++) {
        const amountDue = i === loan.tenureMonths - 1 ? (Math.round((total - each * (loan.tenureMonths - 1)) * 100) / 100).toFixed(2) : each.toFixed(2);
        const dueDate = new Date(Date.UTC(startMonth.getUTCFullYear(), startMonth.getUTCMonth() + 1 + i, 1));
        const dueMonth = `${dueDate.getUTCFullYear()}-${String(dueDate.getUTCMonth() + 1).padStart(2, '0')}`;
        await manager.save(
          LoanRepaymentEntity,
          manager.create(LoanRepaymentEntity, { loan, dueMonth, amountDue, status: 'Due' }),
        );
      }
    });
    const disbursed = await this.findOne(id);
    this.emitStatus(disbursed);
    this.eventEmitter.emit(DomainEvents.LoanDisbursed, {
      loanId: disbursed.id,
      loanRef: disbursed.loanRef ?? disbursed.id.slice(0, 8),
      clientName: disbursed.client?.fullName ?? '',
      principal: Number(disbursed.principal),
      totalInterest: Number(disbursed.totalInterest),
      totalRepayable: Number(disbursed.totalRepayable),
      date: new Date().toISOString().slice(0, 10),
    } as LoanDisbursedEvent);
    return disbursed;
  }

  async findRepayments(loanId: string): Promise<LoanRepaymentEntity[]> {
    return this.repaymentsRepo.find({ where: { loan: { id: loanId } }, order: { dueMonth: 'ASC' } });
  }

  /** Records a payment against one installment - supports partial payments, and marks the loan Completed once every installment is fully paid. */
  async recordRepayment(repaymentId: string, dto: RecordLoanRepaymentDto, actor: AuthenticatedUser): Promise<LoanRepaymentEntity> {
    const repayment = await this.repaymentsRepo.findOne({ where: { id: repaymentId }, relations: ['loan', 'loan.client'] });
    if (!repayment) throw new NotFoundException('Repayment installment not found.');
    if (repayment.loan.status !== 'Disbursed') {
      throw new BadRequestException(`Repayments can only be recorded on a disbursed loan. This loan is ${repayment.loan.status}.`);
    }
    const paidBefore = (await this.findRepayments(repayment.loan.id)).reduce((sum, r) => sum + Number(r.amountPaid), 0);
    const remaining = Number(repayment.amountDue) - Number(repayment.amountPaid);
    if (remaining <= 0.009) throw new BadRequestException('This installment is already fully paid.');
    if (dto.amount > remaining + 0.01) {
      throw new BadRequestException(`Only NLe ${remaining.toFixed(2)} is left on this installment. Record the rest against the next one.`);
    }

    const newAmountPaid = Number(repayment.amountPaid) + dto.amount;
    const fullyPaid = newAmountPaid >= Number(repayment.amountDue) - 0.01; // small tolerance for rounding
    await this.repaymentsRepo.update(repaymentId, {
      amountPaid: newAmountPaid.toFixed(2),
      status: fullyPaid ? 'Paid' : 'Partial',
      paidAt: fullyPaid ? new Date() : repayment.paidAt,
      recordedBy: actor.id,
    });

    const loan = repayment.loan;
    const totalRepayable = Number(loan.totalRepayable);
    // Interest earned so far = total interest x share repaid. Taking the difference before and after
    // this payment means the rounding cents never pile up: once the loan is repaid, all of it is income.
    const earned = (paid: number) => (totalRepayable > 0 ? r2(Number(loan.totalInterest) * Math.min(1, paid / totalRepayable)) : 0);
    const interestPortion = r2(earned(paidBefore + dto.amount) - earned(paidBefore));
    this.eventEmitter.emit(DomainEvents.LoanRepaymentRecorded, {
      loanId: loan.id,
      loanRef: loan.loanRef ?? loan.id.slice(0, 8),
      repaymentId,
      clientName: loan.client?.fullName ?? '',
      dueMonth: repayment.dueMonth,
      amount: dto.amount,
      interestPortion,
      paymentMethod: dto.paymentMethod ?? 'Cash Office Payment',
      date: new Date().toISOString().slice(0, 10),
    } as LoanRepaymentRecordedEvent);

    const allInstallments = await this.findRepayments(repayment.loan.id);
    const allInstallmentsForThisLoan = allInstallments.map((r) => (r.id === repaymentId ? { ...r, status: fullyPaid ? 'Paid' : r.status } : r));
    if (allInstallmentsForThisLoan.every((r) => r.status === 'Paid')) {
      await this.loansRepo.update(repayment.loan.id, { status: 'Completed' });
      this.emitStatus(await this.findOne(repayment.loan.id));
    }

    return this.repaymentsRepo.findOneOrFail({ where: { id: repaymentId } });
  }
}
