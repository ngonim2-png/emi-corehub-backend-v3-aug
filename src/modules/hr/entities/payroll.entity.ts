import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
} from 'typeorm';
import { EmployeeEntity } from './employee.entity';

export type PayrollRunStatus = 'Draft' | 'Finalized';

/**
 * One per month. Stays 'Draft' - editable, re-uploadable - until HR
 * explicitly finalizes it, which is the point at which it's treated as
 * the definitive record for that month and locked against further
 * changes. Salary payment date is nominally the 25th, though EMI's own
 * process sometimes runs later - finalizing is a deliberate HR action,
 * not something tied to a specific calendar date.
 */
@Entity('payroll_runs')
export class PayrollRunEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  month: string; // 'YYYY-MM'

  @Column({ default: 'Draft' })
  status: PayrollRunStatus;

  @Column({ type: 'varchar', nullable: true })
  sourceFileName: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  finalizedAt: Date | null;

  @Column({ type: 'uuid', nullable: true })
  finalizedBy: string | null;

  @Column({ type: 'uuid' })
  createdBy: string;

  @CreateDateColumn()
  createdAt: Date;
}

/**
 * One employee's figures within one month's payroll run. Everything
 * except absenceDaysCount/absenceDeductionMinor comes straight from
 * the monthly upload as EMI's own payroll already computes it - the
 * absence deduction is the one thing this system adds on top, kept as
 * its own clearly-labeled line rather than folded into the existing
 * "Penalty" field, precisely so it's obviously auditable as coming
 * from the attendance register rather than a manual entry.
 */
@Entity('payroll_lines')
export class PayrollLineEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  payrollRunId: string;

  @ManyToOne(() => EmployeeEntity)
  employee: EmployeeEntity;

  @Column({ type: 'int', nullable: true })
  itemNumber: number | null;

  @Column('numeric', { precision: 10, scale: 2 })
  daysWorked: string;

  @Column('numeric', { precision: 12, scale: 2 })
  ratePerDay: string;

  @Column('numeric', { precision: 12, scale: 2 })
  basicSalary: string;

  @Column('numeric', { precision: 12, scale: 2, default: 0 })
  transportation: string;

  @Column('numeric', { precision: 12, scale: 2, default: 0 })
  rentAllowance: string;

  @Column('numeric', { precision: 12, scale: 2, default: 0 })
  medicalAllowance: string;

  @Column('numeric', { precision: 12, scale: 2, default: 0 })
  mobileAllowance: string;

  @Column('numeric', { precision: 12, scale: 2, default: 0 })
  nassitEmployee: string;

  @Column('numeric', { precision: 12, scale: 2, default: 0 })
  nassitEmployer: string;

  @Column('numeric', { precision: 12, scale: 2, default: 0 })
  paye: string;

  @Column('numeric', { precision: 12, scale: 2 })
  totalCostToCompany: string;

  @Column('numeric', { precision: 12, scale: 2, default: 0 })
  paySmolSmolPremium: string;

  @Column('numeric', { precision: 12, scale: 2, default: 0 })
  endowmentCredit: string;

  @Column('numeric', { precision: 12, scale: 2, default: 0 })
  riceCredit: string;

  @Column('numeric', { precision: 12, scale: 2, default: 0 })
  penalty: string;

  @Column('numeric', { precision: 12, scale: 2, default: 0 })
  debtSalaryAdvances: string;

  /** Unapproved-absence days found by cross-referencing attendance and leave records for this employee and month - computed, not entered by hand. */
  @Column({ type: 'int', default: 0 })
  absenceDaysCount: number;

  /** absenceDaysCount * ratePerDay - kept as its own line so it's visibly distinct from the manually-entered penalty above. */
  @Column('numeric', { precision: 12, scale: 2, default: 0 })
  absenceDeduction: string;

  /** The Bank Transfer figure as it appeared in the uploaded file, kept for reference/audit - the actual payable amount is computed fresh (see payroll.service.ts) so it reflects any edits made after upload, including the absence deduction the original file never had. */
  @Column('numeric', { precision: 12, scale: 2, nullable: true })
  originalBankTransferFromFile: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
