import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn } from 'typeorm';
import { ClientEntity } from '../../clients-policies/entities/client.entity';

export type LoanType = 'Cash' | 'Appliance';
export type LoanStatus =
  | 'Pending Life Manager Approval'
  | 'Pending Finance Director Approval'
  | 'Approved'
  | 'Rejected'
  | 'Deferred'
  | 'Disbursed'
  | 'Completed';
export type LoanApprovalDecision = 'Approved' | 'Rejected' | 'Deferred' | 'Approved With Conditions' | 'Declined';

/** Purposes as printed on the EMI Loan Application Form. */
export const LOAN_PURPOSES = ['Commercial / Income Generation', 'Personal Use', 'Other'] as const;
export type LoanPurpose = (typeof LOAN_PURPOSES)[number];

export const ID_TYPES = ['National ID Card', "Driver's Licence", 'Passport', 'Voter ID', 'Other approved identification'] as const;
export const PREMIUM_PAYMENT_METHODS = ['AG Payroll Deduction', 'Bank Standing Order', 'Cash Office Payment', 'Mobile Money', 'Field Collection'] as const;
export const PAYMENT_PERFORMANCE = ['Excellent', 'Good', 'Fair', 'Poor'] as const;
export const CREDIT_ASSESSMENTS = ['Satisfactory', 'Requires Further Review', 'Unsatisfactory'] as const;
export const DECISION_OUTCOMES = ['Approved', 'Approved With Conditions', 'Deferred', 'Declined'] as const;
export type DecisionOutcome = (typeof DECISION_OUTCOMES)[number];

/** Section 5 of the paper form. `payrollOnly` items are needed only when the premium comes through AG payroll. */
export const LOAN_CHECKLIST: { key: string; label: string; payrollOnly?: boolean }[] = [
  { key: 'applicationForm', label: 'Completed loan application form' },
  { key: 'identification', label: 'Valid National ID / approved identification' },
  { key: 'policyProof', label: 'Proof of existing insurance policy / policy no.' },
  { key: 'premiumEvidence', label: 'Evidence of active insurance premium payments' },
  { key: 'photographs', label: 'Recent passport-size photographs' },
  { key: 'addressProof', label: 'Proof of residential address' },
  { key: 'salarySlips', label: 'Latest salary slip(s)', payrollOnly: true },
  { key: 'staffPin', label: 'Staff PIN information', payrollOnly: true },
  { key: 'payrollDeduction', label: 'Signed payroll deduction', payrollOnly: true },
];

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

  /** Readable reference, LN-YYYY-0001, shown to staff and the client. */
  @Column({ type: 'varchar', nullable: true, unique: true })
  loanRef: string | null;

  @ManyToOne(() => ClientEntity, { onDelete: 'RESTRICT' })
  client: ClientEntity;

  @Column({ type: 'varchar', nullable: true })
  purpose: LoanPurpose | null;

  /** What the money is for, in the applicant's words (required when the purpose is Other). */
  @Column({ type: 'text', nullable: true })
  purposeDetail: string | null;

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

  /** 'Staff' or 'Client App' - for a client-app request, requestedBy holds the client's own id. */
  @Column({ default: 'Staff' })
  requestedVia: string;

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

  // ---- application (form sections 1 to 4 and 6)
  @Column({ type: 'varchar', nullable: true }) branch: string | null;
  @Column({ type: 'varchar', nullable: true }) premiumPaymentMethod: string | null;
  @Column({ type: 'varchar', nullable: true }) occupation: string | null;
  @Column({ type: 'varchar', nullable: true }) staffPinCode: string | null;
  @Column('numeric', { precision: 12, scale: 2, nullable: true }) monthlyIncome: string | null;
  @Column('numeric', { precision: 12, scale: 2, nullable: true }) existingMonthlyDebt: string | null;
  @Column({ type: 'varchar', nullable: true }) idType: string | null;
  @Column({ type: 'varchar', nullable: true }) idNumber: string | null;
  @Column({ type: 'date', nullable: true }) idExpiry: string | null;
  /** Name typed by the applicant when accepting the declaration. */
  @Column({ type: 'varchar', nullable: true }) declarationName: string | null;
  @Column({ type: 'timestamptz', nullable: true }) declarationAcceptedAt: Date | null;
  /** Section 5: key -> true once staff have the document. */
  @Column({ type: 'jsonb', default: () => "'{}'" }) checklist: Record<string, boolean>;
  /** What the applicant asked for; principal/tenureMonths hold what was finally approved. */
  @Column('numeric', { precision: 12, scale: 2, nullable: true }) requestedPrincipal: string | null;
  @Column({ type: 'int', nullable: true }) requestedTenureMonths: number | null;

  // ---- verification and credit assessment (section 7 A and B)
  @Column({ type: 'boolean', nullable: true }) policyVerified: boolean | null;
  @Column({ type: 'varchar', nullable: true }) verifiedPolicyNo: string | null;
  @Column({ type: 'varchar', nullable: true }) paymentPerformance: string | null;
  @Column({ type: 'int', nullable: true }) monthsAsClient: number | null;
  @Column('numeric', { precision: 12, scale: 2, nullable: true }) outstandingPremium: string | null;
  @Column('numeric', { precision: 12, scale: 2, nullable: true }) verifiedMonthlyIncome: string | null;
  @Column('numeric', { precision: 12, scale: 2, nullable: true }) verifiedExistingDebt: string | null;
  @Column('numeric', { precision: 6, scale: 2, nullable: true }) dtiPct: string | null;
  @Column('numeric', { precision: 12, scale: 2, nullable: true }) recommendedAmount: string | null;
  @Column({ type: 'int', nullable: true }) recommendedTenureMonths: number | null;
  @Column('numeric', { precision: 12, scale: 2, nullable: true }) downPayment: string | null;
  @Column({ type: 'varchar', nullable: true }) creditAssessment: string | null;
  @Column({ type: 'text', nullable: true }) assessmentComments: string | null;
  @Column({ type: 'uuid', nullable: true }) assessedBy: string | null;
  @Column({ type: 'timestamptz', nullable: true }) assessedAt: Date | null;

  // ---- decision (section 7 C)
  @Column({ type: 'varchar', nullable: true }) decisionOutcome: DecisionOutcome | null;
  @Column({ type: 'text', nullable: true }) conditions: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  disbursedAt: Date | null;

  @Column({ type: 'uuid', nullable: true })
  disbursedBy: string | null;
}
