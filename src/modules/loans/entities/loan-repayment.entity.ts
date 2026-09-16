import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn } from 'typeorm';
import { LoanEntity } from './loan.entity';

export type LoanRepaymentStatus = 'Due' | 'Paid' | 'Overdue' | 'Partial';

/** One row per monthly installment - created all at once when a loan is disbursed, then updated as payments come in. Mirrors how premium payments track expected-vs-paid per month, kept as a separate schedule since a loan repayment is a different obligation from a premium payment even for the same client. */
@Entity('loan_repayments')
export class LoanRepaymentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => LoanEntity, { onDelete: 'CASCADE' })
  loan: LoanEntity;

  /** YYYY-MM this installment covers. */
  @Column()
  dueMonth: string;

  @Column('numeric', { precision: 12, scale: 2 })
  amountDue: string;

  @Column('numeric', { precision: 12, scale: 2, default: 0 })
  amountPaid: string;

  @Column({ type: 'timestamptz', nullable: true })
  paidAt: Date | null;

  @Column({ default: 'Due' })
  status: LoanRepaymentStatus;

  @Column({ type: 'uuid', nullable: true })
  recordedBy: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
