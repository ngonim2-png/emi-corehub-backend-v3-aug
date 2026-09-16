import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn } from 'typeorm';
import { ClientEntity } from '../../clients-policies/entities/client.entity';

export type LoanType = 'Cash' | 'Appliance';
export type LoanStatus =
  | 'Pending Life Manager Approval'
  | 'Pending Finance Director Approval'
  | 'Approved'
  | 'Rejected'
  | 'Disbursed'
  | 'Completed';
export type LoanApprovalDecision = 'Approved' | 'Rejected';

/**
 * Flat-rate loan interest, per the business rule as given: total
 * interest is 25% of the principal, regardless of tenure - "25% divided
 * by the number of months" describes how that fixed total gets spread
 * into a monthly interest component for repayment purposes, not that a
 * shorter loan costs less interest overall. Kept as its own named
 * function (not inlined) so the one calculation everywhere in this
 * module relies on - creation, the repayment schedule, any future
 * recalculation - can never quietly drift into two different formulas.
 */
export function computeLoanFigures(principal: number, tenureMonths: number, interestRatePct: number) {
  const totalInterest = principal * (interestRatePct / 100);
  const totalRepayable = principal + totalInterest;
  const monthlyPayment = totalRepayable / tenureMonths;
  return { totalInterest, totalRepayable, monthlyPayment };
}

@Entity('loans')
export class LoanEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => ClientEntity, { onDelete: 'RESTRICT' })
  client: ClientEntity;

  @Column()
  loanType: LoanType;

  /** Only meaningful for Appliance loans - what the appliance actually is. */
  @Column({ type: 'text', nullable: true })
  applianceDescription: string | null;

  @Column('numeric', { precision: 12, scale: 2 })
  principal: string;

  @Column({ type: 'int' })
  tenureMonths: number;

  /** Stored per-loan (not just read from a constant) so a loan's original terms stay fixed and auditable even if the standard rate is ever changed later. */
  @Column('numeric', { precision: 5, scale: 2, default: 25 })
  interestRatePct: string;

  @Column('numeric', { precision: 12, scale: 2 })
  totalInterest: string;

  @Column('numeric', { precision: 12, scale: 2 })
  totalRepayable: string;

  @Column('numeric', { precision: 12, scale: 2 })
  monthlyPayment: string;

  @Column({ default: 'Pending Life Manager Approval' })
  status: LoanStatus;

  @Column({ type: 'uuid' })
  requestedBy: string;

  @CreateDateColumn()
  requestedAt: Date;

  @Column({ type: 'varchar', nullable: true })
  lifeManagerDecision: LoanApprovalDecision | null;

  @Column({ type: 'uuid', nullable: true })
  lifeManagerBy: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  lifeManagerAt: Date | null;

  @Column({ type: 'text', nullable: true })
  lifeManagerNotes: string | null;

  @Column({ type: 'varchar', nullable: true })
  financeDirectorDecision: LoanApprovalDecision | null;

  @Column({ type: 'uuid', nullable: true })
  financeDirectorBy: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  financeDirectorAt: Date | null;

  @Column({ type: 'text', nullable: true })
  financeDirectorNotes: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  disbursedAt: Date | null;

  @Column({ type: 'uuid', nullable: true })
  disbursedBy: string | null;
}
