import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmployeeEntity, LeaveRequestEntity, AttendanceEntity } from './entities/employee.entity';
import { CreateEmployeeDto, CreateLeaveRequestDto, DecideLeaveRequestDto, MarkAttendanceDto } from './dto/hr.dto';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

@Injectable()
export class HrService {
  constructor(
    @InjectRepository(EmployeeEntity) private readonly employeesRepo: Repository<EmployeeEntity>,
    @InjectRepository(LeaveRequestEntity)
    private readonly leaveRepo: Repository<LeaveRequestEntity>,
    @InjectRepository(AttendanceEntity)
    private readonly attendanceRepo: Repository<AttendanceEntity>,
  ) {}

  async createEmployee(dto: CreateEmployeeDto): Promise<EmployeeEntity> {
    return this.employeesRepo.save(this.employeesRepo.create({ ...dto, status: 'Active' }));
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
    return this.leaveRepo.find({ order: { createdAt: 'DESC' } });
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
