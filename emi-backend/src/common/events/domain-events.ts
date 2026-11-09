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
