import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { EmployeeEntity, LeaveRequestEntity, AttendanceEntity } from './entities/employee.entity';
import { CreateEmployeeDto, CreateLeaveRequestDto, DecideLeaveRequestDto, ExitEmployeeDto, MarkAttendanceDto, UpdateEmployeeDto } from './dto/hr.dto';
import { PayrollLineEntity } from './entities/payroll.entity';
import { DepartmentEntity } from '../requisitions/entities/requisition.entity';
import { UserEntity } from '../identity-access/entities/user.entity';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

@Injectable()
export class HrService {
  constructor(
    @InjectRepository(EmployeeEntity) private readonly employeesRepo: Repository<EmployeeEntity>,
    @InjectRepository(LeaveRequestEntity)
    private readonly leaveRepo: Repository<LeaveRequestEntity>,
    @InjectRepository(AttendanceEntity)
    private readonly attendanceRepo: Repository<AttendanceEntity>,
    @InjectRepository(PayrollLineEntity) private readonly payrollLinesRepo: Repository<PayrollLineEntity>,
    @InjectRepository(DepartmentEntity) private readonly deptRepo: Repository<DepartmentEntity>,
    @InjectRepository(UserEntity) private readonly usersRepo: Repository<UserEntity>,
  ) {}

  /** Departments are one shared list (HR and office requisitions); a new name typed by HR is added to it. */
  private async ensureDepartment(name: string): Promise<string> {
    const clean = name.trim().replace(/\s+/g, ' ');
    const all = await this.deptRepo.find();
    const found = all.find((d) => d.name.toLowerCase() === clean.toLowerCase());
    if (found) {
      if (!found.active) await this.deptRepo.update(found.id, { active: true });
      return found.name;
    }
    await this.deptRepo.save(this.deptRepo.create({ name: clean, active: true }));
    return clean;
  }

  async createEmployee(dto: CreateEmployeeDto): Promise<EmployeeEntity> {
    const department = await this.ensureDepartment(dto.department);
    return this.employeesRepo.save(this.employeesRepo.create({ ...dto, department, status: 'Active' }));
  }

  private async getEmployee(id: string) {
    const e = await this.employeesRepo.findOne({ where: { id } });
    if (!e) throw new NotFoundException('Employee not found.');
    return e;
  }

  /** HR corrects or changes a staff record: name, department, title, hire date, status, linked login. */
  async updateEmployee(id: string, dto: UpdateEmployeeDto): Promise<EmployeeEntity> {
    const e = await this.getEmployee(id);
    const patch: Partial<EmployeeEntity> = {};
    if (dto.fullName !== undefined) patch.fullName = dto.fullName.trim();
    if (dto.jobTitle !== undefined) patch.jobTitle = dto.jobTitle.trim();
    if (dto.hireDate !== undefined) patch.hireDate = dto.hireDate;
    if (dto.department !== undefined) patch.department = await this.ensureDepartment(dto.department);
    if (dto.status !== undefined) {
      if (e.status === 'Exited') throw new BadRequestException('This person has left. Use "Bring back" to make them active again.');
      patch.status = dto.status;
    }
    if (dto.userId !== undefined) {
      if (dto.userId) {
        const u = await this.usersRepo.findOne({ where: { id: dto.userId } });
        if (!u) throw new BadRequestException('That login was not found.');
        const other = await this.employeesRepo.findOne({ where: { userId: dto.userId } });
        if (other && other.id !== id) throw new BadRequestException(`That login is already linked to ${other.fullName}.`);
      }
      patch.userId = dto.userId || null;
    }
    if (Object.keys(patch).length) await this.employeesRepo.update(id, patch);
    return this.getEmployee(id);
  }

  /** Moves several people to one department at once. */
  async reassignEmployees(ids: string[], department: string) {
    const name = await this.ensureDepartment(department);
    const found = await this.employeesRepo.find({ where: { id: In(ids) } });
    if (found.length !== ids.length) throw new BadRequestException('Some of the selected staff were not found.');
    await this.employeesRepo.update({ id: In(ids) }, { department: name });
    return { moved: found.length, department: name };
  }

  /**
   * Records that someone has left. The record stays (payroll, leave and attendance
   * history need it). Optionally their CoreHub login is switched off, and they stop
   * being head of any department so requisitions don't wait on them.
   */
  async exitEmployee(id: string, dto: ExitEmployeeDto, actor: AuthenticatedUser) {
    const e = await this.getEmployee(id);
    if (e.status === 'Exited') throw new BadRequestException('Already recorded as left.');
    await this.employeesRepo.update(id, {
      status: 'Exited', exitDate: dto.exitDate, exitReason: dto.note?.trim() ? `${dto.reason}: ${dto.note.trim()}` : dto.reason,
    });
    let loginDisabled = false;
    const headOf: string[] = [];
    if (e.userId) {
      const depts = await this.deptRepo.find({ where: { headUserId: e.userId } });
      for (const d of depts) { await this.deptRepo.update(d.id, { headUserId: null }); headOf.push(d.name); }
      if (dto.disableLogin) {
        if (e.userId === actor.id) throw new BadRequestException('You cannot switch off your own login.');
        const u = await this.usersRepo.findOne({ where: { id: e.userId } });
        if (u && ['Supreme Admin'].includes(u.role?.name ?? '')) throw new BadRequestException('The Supreme Admin login can only be changed by the Supreme Admin.');
        if (u) { await this.usersRepo.update(u.id, { status: 'Disabled' }); loginDisabled = true; }
      }
    }
    return { employee: await this.getEmployee(id), loginDisabled, noLongerHeadOf: headOf, hadLogin: !!e.userId };
  }

  /** Undo a leaving record (for example entered by mistake, or the person came back). Their login stays as it is. */
  async reinstateEmployee(id: string) {
    const e = await this.getEmployee(id);
    if (e.status !== 'Exited') throw new BadRequestException('This person has not left.');
    await this.employeesRepo.update(id, { status: 'Active', exitDate: null, exitReason: null });
    return this.getEmployee(id);
  }

  /**
   * Deletes a staff record entered by mistake. Anyone with payroll, leave or attendance
   * history is kept (record them as left instead), so past payroll still adds up.
   */
  async deleteEmployee(id: string) {
    const e = await this.getEmployee(id);
    const [payroll, leave, attendance] = await Promise.all([
      this.payrollLinesRepo.count({ where: { employee: { id } } }),
      this.leaveRepo.count({ where: { employee: { id } } }),
      this.attendanceRepo.count({ where: { employee: { id } } }),
    ]);
    if (payroll || leave || attendance) {
      const what = [payroll ? `${payroll} payroll line${payroll === 1 ? '' : 's'}` : '', leave ? `${leave} leave request${leave === 1 ? '' : 's'}` : '', attendance ? `${attendance} attendance record${attendance === 1 ? '' : 's'}` : ''].filter(Boolean).join(', ');
      throw new BadRequestException(`${e.fullName} has history (${what}), so the record has to be kept. Record them as left instead.`);
    }
    await this.employeesRepo.delete(id);
    return { deleted: true, fullName: e.fullName };
  }

  async findEmployees(): Promise<EmployeeEntity[]> {
    return this.employeesRepo.find({ order: { createdAt: 'DESC' } });
  }

  async requestLeave(dto: CreateLeaveRequestDto): Promise<LeaveRequestEntity> {
    const employee = await this.employeesRepo.findOneOrFail({ where: { id: dto.employeeId } });
    return this.leaveRepo.save(
      this.leaveRepo.create({
        employee,
        type: dto.type,
        fromDate: dto.fromDate,
        toDate: dto.toDate,
        status: 'Pending',
      }),
    );
  }

  async decideLeave(id: string, dto: DecideLeaveRequestDto): Promise<LeaveRequestEntity> {
    await this.leaveRepo.update(id, { status: dto.status });
    return this.leaveRepo.findOneOrFail({ where: { id } });
  }

  async findLeaveRequests(): Promise<LeaveRequestEntity[]> {
    return this.leaveRepo.find({ order: { createdAt: 'DESC' }, relations: ['employee'] });
  }

  /**
   * Finds this logged-in user's employee record, or creates one the
   * first time they use self-service leave. Checked in order: an
   * existing link by userId (the normal case after the first use),
   * then a name match against their account's full name (covers
   * employees HR or a payroll upload already created before this
   * person ever logged in), then creates a fresh record as a last
   * resort. Matching by name is inherently a little fuzzy - if it
   * links to the wrong existing employee, that's something HR can
   * correct directly on the employee record.
   */
  private async findOrCreateEmployeeForUser(actor: AuthenticatedUser): Promise<EmployeeEntity> {
    const existing = await this.employeesRepo.findOne({ where: { userId: actor.id } });
    if (existing) return existing;

    const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
    const all = await this.employeesRepo.find();
    const nameMatch = all.find((e) => normalize(e.fullName) === normalize(actor.fullName) && !e.userId);
    if (nameMatch) {
      await this.employeesRepo.update(nameMatch.id, { userId: actor.id });
      return { ...nameMatch, userId: actor.id };
    }

    return this.employeesRepo.save(
      this.employeesRepo.create({
        fullName: actor.fullName,
        department: 'Unassigned',
        jobTitle: 'Unassigned',
        hireDate: new Date().toISOString().slice(0, 10),
        status: 'Active',
        userId: actor.id,
      }),
    );
  }

  async requestOwnLeave(actor: AuthenticatedUser, dto: Omit<CreateLeaveRequestDto, 'employeeId'>): Promise<LeaveRequestEntity> {
    const employee = await this.findOrCreateEmployeeForUser(actor);
    return this.leaveRepo.save(
      this.leaveRepo.create({ employee, type: dto.type, fromDate: dto.fromDate, toDate: dto.toDate, status: 'Pending' }),
    );
  }

  async findOwnLeaveRequests(actor: AuthenticatedUser): Promise<LeaveRequestEntity[]> {
    const employee = await this.employeesRepo.findOne({ where: { userId: actor.id } });
    if (!employee) return [];
    return this.leaveRepo.find({ where: { employee: { id: employee.id } }, order: { createdAt: 'DESC' } });
  }

  /** One record per employee per date - marking the same day again updates it rather than duplicating. */
  async markAttendance(dto: MarkAttendanceDto): Promise<AttendanceEntity> {
    const employee = await this.employeesRepo.findOneOrFail({ where: { id: dto.employeeId } });
    const existing = await this.attendanceRepo.findOne({
      where: { employee: { id: dto.employeeId }, date: dto.date },
    });
    if (existing) {
      existing.status = dto.status;
      existing.checkInTime = new Date();
      return this.attendanceRepo.save(existing);
    }
    return this.attendanceRepo.save(
      this.attendanceRepo.create({ employee, date: dto.date, status: dto.status, checkInTime: new Date() }),
    );
  }

  async findAttendance(month?: string, employeeId?: string): Promise<AttendanceEntity[]> {
    const qb = this.attendanceRepo
      .createQueryBuilder('attendance')
      .leftJoinAndSelect('attendance.employee', 'employee')
      .orderBy('attendance.date', 'DESC');
    if (month) qb.andWhere("to_char(attendance.date, 'YYYY-MM') = :month", { month });
    if (employeeId) qb.andWhere('employee.id = :employeeId', { employeeId });
    return qb.getMany();
  }
}
