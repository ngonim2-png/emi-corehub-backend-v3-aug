import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as ExcelJS from 'exceljs';
import { PayrollRunEntity, PayrollLineEntity } from './entities/payroll.entity';
import { EmployeeEntity, LeaveRequestEntity, AttendanceEntity } from './entities/employee.entity';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

interface ParsedPayrollRow {
  itemNumber: number | null;
  fullName: string;
  jobTitleHint: string | null;
  daysWorked: number;
  ratePerDay: number;
  basicSalary: number;
  transportation: number;
  rentAllowance: number;
  medicalAllowance: number;
  mobileAllowance: number;
  nassitEmployee: number;
  nassitEmployer: number;
  paye: number;
  totalCostToCompany: number;
  paySmolSmolPremium: number;
  endowmentCredit: number;
  riceCredit: number;
  penalty: number;
  debtSalaryAdvances: number;
  bankTransferFromFile: number | null;
}

/**
 * The real monthly payroll export is a report, not a clean table - it
 * mixes genuine employee rows with section headers ("Head office",
 * "Provinces"), subtotal rows ("Total", "Grand Total"), and summary
 * category rows ("Nassit", "Advance salary", "Security company") all
 * in the same name column. Verified against a real file: the one
 * reliable signal that a row is a genuine, payable employee is that it
 * has an actual Basic Salary figure - every non-employee row, and even
 * a few rows with real employee names but no salary data in this
 * particular file (provincial staff paid through a different
 * mechanism, evidently), has a blank Basic Salary. Column positions
 * are read by header label, not fixed position, for the same reason
 * every other roster/deduction parser in this system does that - real
 * exports drift.
 */
async function parsePayrollFile(buffer: Buffer): Promise<{ rows: ParsedPayrollRow[]; skippedNamedNoSalary: string[] }> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as any);
  const ws = wb.worksheets[0];
  if (!ws) throw new BadRequestException('That file has no worksheet to read.');
  const headerRow = ws.getRow(1);
  const col: Record<string, number> = {};
  for (let c = 1; c <= headerRow.cellCount; c++) {
    const v = headerRow.getCell(c).value;
    if (v) col[String(v).trim().toUpperCase()] = c;
  }
  const need = (label: string) => {
    const c = col[label];
    if (!c) throw new BadRequestException(`Could not find the expected "${label}" column in this file.`);
    return c;
  };
  const cName = need('NAME');
  const cItem = col['ITEM NUMBER'];
  const cDays = need('DAYS WORKED');
  const cRate = need('RATE PER DAYS');
  const cBasic = need('BASIC SALARY');
  const cTransport = col['TRANSPORTATION'];
  const cRent = col['RENT ALLOWANCE'];
  const cMedical = col['MEDICAL ALLOWANCE'];
  const cMobile = col['MOBILE TOP UP/COMMUNICATION'];
  const cNassitE = col['NASSIT EMPLOYEE'];
  const cNassitR = col['NASSIT EMPLOYER'];
  const cPaye = col['PAYE'];
  const cTotalCost = col['TOTAL COST TO COMPANY'];
  const cPremium = col['PAY SMOLL SMOLL PREMIUM'];
  const cEndowment = col['ENDOWMENT CREDIT'];
  const cRice = col['RICE CREDIT'];
  const cPenalty = col['PENALTY'];
  const cDebt = col['DEBT / SALARY ADVANCES'];
  const cBankTransfer = col['BANK TRANSFER'];

  const num = (v: any): number => {
    if (v === null || v === undefined || v === '') return 0;
    if (typeof v === 'object' && v !== null && 'result' in v) {
      // A formula cell (e.g. Basic Salary = Days Worked * Rate/day) -
      // ExcelJS returns {formula, result, ...} rather than a plain
      // number for these. Confirmed against the real file: Basic
      // Salary, both NASSIT figures, Total Cost to Company, and Bank
      // Transfer are all formulas, not flat entered values.
      const n = typeof v.result === 'number' ? v.result : parseFloat(v.result);
      return isNaN(n) ? 0 : n;
    }
    const n = typeof v === 'number' ? v : parseFloat(v);
    return isNaN(n) ? 0 : n;
  };

  const rows: ParsedPayrollRow[] = [];
  const skippedNamedNoSalary: string[] = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const nameCell = row.getCell(cName).value;
    if (!nameCell) continue;
    const basicCell = row.getCell(cBasic).value;
    if (basicCell === null || basicCell === undefined || basicCell === '') {
      const text = String(nameCell).trim();
      if (text && text.length > 2) skippedNamedNoSalary.push(text);
      continue;
    }
    let fullName = String(nameCell).trim();
    let jobTitleHint: string | null = null;
    const dashMatch = fullName.match(/^(.+?)\s*-\s*(.+)$/);
    if (dashMatch) {
      fullName = dashMatch[1].trim();
      jobTitleHint = dashMatch[2].trim();
    }
    rows.push({
      itemNumber: cItem ? (typeof row.getCell(cItem).value === 'number' ? (row.getCell(cItem).value as number) : null) : null,
      fullName,
      jobTitleHint,
      daysWorked: num(row.getCell(cDays).value),
      ratePerDay: num(row.getCell(cRate).value),
      basicSalary: num(basicCell),
      transportation: cTransport ? num(row.getCell(cTransport).value) : 0,
      rentAllowance: cRent ? num(row.getCell(cRent).value) : 0,
      medicalAllowance: cMedical ? num(row.getCell(cMedical).value) : 0,
      mobileAllowance: cMobile ? num(row.getCell(cMobile).value) : 0,
      nassitEmployee: cNassitE ? num(row.getCell(cNassitE).value) : 0,
      nassitEmployer: cNassitR ? num(row.getCell(cNassitR).value) : 0,
      paye: cPaye ? num(row.getCell(cPaye).value) : 0,
      totalCostToCompany: cTotalCost ? num(row.getCell(cTotalCost).value) : num(basicCell),
      paySmolSmolPremium: cPremium ? num(row.getCell(cPremium).value) : 0,
      endowmentCredit: cEndowment ? num(row.getCell(cEndowment).value) : 0,
      riceCredit: cRice ? num(row.getCell(cRice).value) : 0,
      penalty: cPenalty ? num(row.getCell(cPenalty).value) : 0,
      debtSalaryAdvances: cDebt ? num(row.getCell(cDebt).value) : 0,
      bankTransferFromFile: cBankTransfer ? num(row.getCell(cBankTransfer).value) : null,
    });
  }
  return { rows, skippedNamedNoSalary };
}

@Injectable()
export class PayrollService {
  constructor(
    @InjectRepository(PayrollRunEntity) private readonly runsRepo: Repository<PayrollRunEntity>,
    @InjectRepository(PayrollLineEntity) private readonly linesRepo: Repository<PayrollLineEntity>,
    @InjectRepository(EmployeeEntity) private readonly employeesRepo: Repository<EmployeeEntity>,
    @InjectRepository(AttendanceEntity) private readonly attendanceRepo: Repository<AttendanceEntity>,
    @InjectRepository(LeaveRequestEntity) private readonly leaveRepo: Repository<LeaveRequestEntity>,
  ) {}

  private normalizeForMatch(name: string): string {
    return name.trim().toLowerCase().replace(/\s+/g, ' ');
  }

  /**
   * Unapproved-absence days for one employee in one month: attendance
   * records marked 'Absent' where no 'Approved' leave request covers
   * that date. An 'Absent' day that IS covered by approved leave isn't
   * a deduction - that's what approved leave is for.
   */
  private async countUnexcusedAbsences(employeeId: string, month: string): Promise<number> {
    const absences = await this.attendanceRepo
      .createQueryBuilder('a')
      .where('a.employeeId = :employeeId', { employeeId })
      .andWhere("to_char(a.date, 'YYYY-MM') = :month", { month })
      .andWhere('a.status = :status', { status: 'Absent' })
      .getMany();
    if (absences.length === 0) return 0;

    const approvedLeave = await this.leaveRepo.find({
      where: { employee: { id: employeeId }, status: 'Approved' },
    });
    let count = 0;
    for (const a of absences) {
      const covered = approvedLeave.some((l) => a.date >= l.fromDate && a.date <= l.toDate);
      if (!covered) count++;
    }
    return count;
  }

  async uploadPayroll(
    buffer: Buffer,
    month: string,
    fileName: string,
    actor: AuthenticatedUser,
  ): Promise<{ runId: string; matched: number; created: number; skippedNamedNoSalary: string[] }> {
    if (!/^\d{4}-\d{2}$/.test(month)) throw new BadRequestException('month must be in YYYY-MM format.');
    const existingRun = await this.runsRepo.findOne({ where: { month } });
    if (existingRun && existingRun.status === 'Finalized') {
      throw new ForbiddenException("This month's payroll has already been finalized and can't be replaced by a new upload. Delete or amend individual lines instead.");
    }

    const { rows, skippedNamedNoSalary } = await parsePayrollFile(buffer);
    if (rows.length === 0) {
      throw new BadRequestException('No employee rows with a Basic Salary figure were found in that file - check it is the right export.');
    }

    const run = existingRun
      ? await this.runsRepo.save({ ...existingRun, sourceFileName: fileName })
      : await this.runsRepo.save(this.runsRepo.create({ month, status: 'Draft', sourceFileName: fileName, createdBy: actor.id }));

    await this.linesRepo.delete({ payrollRunId: run.id });

    const allEmployees = await this.employeesRepo.find();
    const byNormalizedName = new Map(allEmployees.map((e) => [this.normalizeForMatch(e.fullName), e]));

    let matched = 0;
    let created = 0;
    for (const row of rows) {
      const key = this.normalizeForMatch(row.fullName);
      let employee = byNormalizedName.get(key);
      if (employee) {
        matched++;
      } else {
        employee = await this.employeesRepo.save(
          this.employeesRepo.create({
            fullName: row.fullName,
            department: 'Unassigned',
            jobTitle: row.jobTitleHint || 'Unassigned',
            hireDate: `${month}-01`,
            status: 'Active',
          }),
        );
        byNormalizedName.set(key, employee);
        created++;
      }

      const absenceDaysCount = await this.countUnexcusedAbsences(employee.id, month);
      const absenceDeduction = absenceDaysCount * row.ratePerDay;

      await this.linesRepo.save(
        this.linesRepo.create({
          payrollRunId: run.id,
          employee,
          itemNumber: row.itemNumber,
          daysWorked: row.daysWorked.toFixed(2),
          ratePerDay: row.ratePerDay.toFixed(2),
          basicSalary: row.basicSalary.toFixed(2),
          transportation: row.transportation.toFixed(2),
          rentAllowance: row.rentAllowance.toFixed(2),
          medicalAllowance: row.medicalAllowance.toFixed(2),
          mobileAllowance: row.mobileAllowance.toFixed(2),
          nassitEmployee: row.nassitEmployee.toFixed(2),
          nassitEmployer: row.nassitEmployer.toFixed(2),
          paye: row.paye.toFixed(2),
          totalCostToCompany: row.totalCostToCompany.toFixed(2),
          paySmolSmolPremium: row.paySmolSmolPremium.toFixed(2),
          endowmentCredit: row.endowmentCredit.toFixed(2),
          riceCredit: row.riceCredit.toFixed(2),
          penalty: row.penalty.toFixed(2),
          debtSalaryAdvances: row.debtSalaryAdvances.toFixed(2),
          absenceDaysCount,
          absenceDeduction: absenceDeduction.toFixed(2),
          originalBankTransferFromFile: row.bankTransferFromFile !== null ? row.bankTransferFromFile.toFixed(2) : null,
        }),
      );
    }

    return { runId: run.id, matched, created, skippedNamedNoSalary };
  }

  /**
   * The payable amount, computed fresh rather than trusted from the
   * upload - this is what makes HR's post-upload edits (and the
   * absence deduction, which the original file never had) actually
   * take effect: Total Cost to Company, less every deduction, plus
   * credits.
   */
  computeNetPay(line: PayrollLineEntity): number {
    return (
      Number(line.totalCostToCompany) -
      Number(line.nassitEmployee) -
      Number(line.paySmolSmolPremium) -
      Number(line.penalty) -
      Number(line.debtSalaryAdvances) -
      Number(line.absenceDeduction) +
      Number(line.endowmentCredit) +
      Number(line.riceCredit)
    );
  }

  async getRun(month: string): Promise<{ run: PayrollRunEntity; lines: (PayrollLineEntity & { netPay: number })[] } | null> {
    const run = await this.runsRepo.findOne({ where: { month } });
    if (!run) return null;
    const lines = await this.linesRepo.find({ where: { payrollRunId: run.id }, relations: ['employee'], order: { itemNumber: 'ASC' } });
    return { run, lines: lines.map((l) => ({ ...l, netPay: this.computeNetPay(l) })) };
  }

  async listRuns(): Promise<PayrollRunEntity[]> {
    return this.runsRepo.find({ order: { month: 'DESC' } });
  }

  async updateLine(lineId: string, updates: Partial<Record<string, number | string>>): Promise<PayrollLineEntity> {
    const line = await this.linesRepo.findOne({ where: { id: lineId } });
    if (!line) throw new NotFoundException('Payroll line not found');
    const run = await this.runsRepo.findOne({ where: { id: line.payrollRunId } });
    if (run?.status === 'Finalized') {
      throw new ForbiddenException('This payroll has been finalized and its lines are locked.');
    }
    const editable = ['penalty', 'debtSalaryAdvances', 'paye', 'endowmentCredit', 'riceCredit', 'notes'];
    const patch: Record<string, any> = {};
    for (const key of editable) {
      if (updates[key] !== undefined) patch[key] = updates[key];
    }
    await this.linesRepo.update(lineId, patch);
    return this.linesRepo.findOneOrFail({ where: { id: lineId } });
  }

  async finalize(runId: string, actor: AuthenticatedUser): Promise<PayrollRunEntity> {
    const run = await this.runsRepo.findOne({ where: { id: runId } });
    if (!run) throw new NotFoundException('Payroll run not found');
    if (run.status === 'Finalized') throw new ForbiddenException('This payroll is already finalized.');
    await this.runsRepo.update(runId, { status: 'Finalized', finalizedAt: new Date(), finalizedBy: actor.id });
    return this.runsRepo.findOneOrFail({ where: { id: runId } });
  }
}
