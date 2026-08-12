import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

export type DeductionRecordStatus = 'Posted' | 'AlreadyPosted' | 'Unmatched' | 'Zero' | 'PolicyCancelled';

/**
 * One row from one government payroll deduction file - logged
 * regardless of outcome, which is what makes zero-deduction and
 * unmatched-pincode rows searchable and isolatable rather than
 * silently disappearing. Deliberately not scoped to a single product:
 * the Accountant General's report is filtered only by company
 * ("Enhanced Mutual Insurance"), not by which of EMI's own products a
 * given pincode belongs to, so one file can genuinely contain rows for
 * several different products at once. Matching is by pincode alone,
 * globally across all policies.
 */
@Entity('deduction_import_records')
export class DeductionImportRecordEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  period: string;

  @Column({ type: 'varchar', nullable: true })
  mdaCode: string | null;

  @Column({ type: 'varchar', nullable: true })
  mdaName: string | null;

  @Column()
  pincode: string;

  @Column()
  employeeName: string;

  @Column('numeric', { precision: 18, scale: 2 })
  amount: string;

  @Column({ type: 'uuid', nullable: true })
  matchedPolicyId: string | null;

  @Column({ type: 'uuid', nullable: true })
  matchedPaymentId: string | null;

  @Column()
  status: DeductionRecordStatus;

  @Column({ type: 'varchar' })
  sourceFileName: string;

  @CreateDateColumn()
  createdAt: Date;
}
