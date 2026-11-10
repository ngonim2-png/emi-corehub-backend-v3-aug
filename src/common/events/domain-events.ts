/**
 * Internal domain events, published via @nestjs/event-emitter.
 * Modules subscribe with @OnEvent(DomainEvents.PaymentPosted) - see
 * notifications/sms.processor.ts and finance-ifrs17/journal.service.ts
 * for real subscribers. This is what lets Field Collection stay unaware
 * that Notifications or Finance even exist.
 */
export enum DomainEvents {
  PolicyCreated = 'policy.created',
  PolicyStatusChanged = 'policy.status_changed',
  PaymentPosted = 'payment.posted',
  PaymentReversed = 'payment.reversed',
  WalletAllocated = 'wallet.allocated',
  UnderwritingApproved = 'underwriting.approved',
  UnderwritingDeclined = 'underwriting.declined',
  ClaimRegistered = 'claim.registered',
  ClaimApproved = 'claim.approved',
  ClaimPaid = 'claim.paid',
  ClaimStatusChanged = 'claim.status_changed',
  LoanStatusChanged = 'loan.status_changed',
  LoanDisbursed = 'loan.disbursed',
  LoanRepaymentRecorded = 'loan.repayment_recorded',
  ComplaintLogged = 'complaint.logged',
  JournalPosted = 'journal.posted',
  PeriodClosed = 'period.closed',
}

export interface PaymentPostedEvent {
  paymentId: string;
  policyId: string;
  clientId: string;
  clientPhone: string;
  clientName: string;
  policyNumber: string;
  amountMajor: number;
  paymentMonth: string;
  receiptNo: string;
  marketerId: string;
  paymentMethod: string;
  /** The policy's AG payroll pincode, if it has one. */
  payrollPinCode?: string | null;
}

export interface PolicyStatusChangedEvent {
  policyId: string;
  previousStatus: string;
  newStatus: string;
  reportingMonth: string;
}

export interface ClaimStatusEvent {
  claimId: string;
  clientId: string;
  clientPhone: string;
  clientName: string;
  policyNumber: string;
  amountMajor: number;
  status: string;
}

export interface ClaimStatusChangedEvent {
  claimId: string;
  claimNo: string;
  clientId: string;
  status: string;
}

export interface LoanStatusChangedEvent {
  loanId: string;
  loanRef?: string | null;
  clientId: string;
  status: string;
  amountMajor: number;
  /** Reason, missing information or conditions to pass on to the client. */
  notes?: string | null;
}

export interface LoanDisbursedEvent {
  loanId: string;
  loanRef: string;
  clientName: string;
  principal: number;
  totalInterest: number;
  totalRepayable: number;
  date: string; // YYYY-MM-DD
}

export interface LoanRepaymentRecordedEvent {
  loanId: string;
  loanRef: string;
  repaymentId: string;
  clientName: string;
  dueMonth: string;
  amount: number;
  /** Share of the amount that is interest (amount x totalInterest / totalRepayable). */
  interestPortion: number;
  paymentMethod: string;
  date: string;
}
