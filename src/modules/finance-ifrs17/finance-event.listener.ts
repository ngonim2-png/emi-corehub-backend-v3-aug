import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { JournalService } from './journal.service';
import { PaymentPostedEvent, ClaimStatusEvent, DomainEvents } from '../../common/events/domain-events';

const CASH_ACCOUNT_BY_METHOD: Record<string, string> = {
  'Token Field Collection': '2300',
  'Cash Office Payment': '1000',
  'Mobile Money': '1020',
  'Bank Transfer': '1010',
  'Payroll Deduction': '1010',
  'Direct Debit': '1010',
};

@Injectable()
export class FinanceEventListener {
  constructor(private readonly journalService: JournalService) {}

  @OnEvent(DomainEvents.PaymentPosted)
  async onPaymentPosted(event: PaymentPostedEvent): Promise<void> {
    const drAccount = CASH_ACCOUNT_BY_METHOD[event.paymentMethod] ?? '1010';
    await this.journalService.post(
      new Date().toISOString().slice(0, 10),
      `Premium received - ${event.clientName} (${event.policyNumber}) ${event.paymentMonth}`,
      [
        { accountCode: drAccount, debit: event.amountMajor, credit: 0 },
        { accountCode: '4000', debit: 0, credit: event.amountMajor },
      ],
      'field-collection-wallet',
      event.paymentId,
      null,
    );
  }

  @OnEvent(DomainEvents.ClaimApproved)
  async onClaimApproved(event: ClaimStatusEvent): Promise<void> {
    await this.journalService.post(
      new Date().toISOString().slice(0, 10),
      `Claim approved - ${event.clientName} (${event.policyNumber})`,
      [
        { accountCode: '5100', debit: event.amountMajor, credit: 0 },
        { accountCode: '2100', debit: 0, credit: event.amountMajor },
      ],
      'claims',
      event.claimId,
      null,
    );
  }

  @OnEvent(DomainEvents.ClaimPaid)
  async onClaimPaid(event: ClaimStatusEvent): Promise<void> {
    await this.journalService.post(
      new Date().toISOString().slice(0, 10),
      `Claim paid - ${event.clientName} (${event.policyNumber})`,
      [
        { accountCode: '2100', debit: event.amountMajor, credit: 0 },
        { accountCode: '1010', debit: 0, credit: event.amountMajor },
      ],
      'claims',
      event.claimId,
      null,
    );
  }
}
