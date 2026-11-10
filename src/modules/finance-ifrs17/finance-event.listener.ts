import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { JournalService } from './journal.service';
import { PaymentPostedEvent, ClaimStatusEvent, DomainEvents, LoanDisbursedEvent, LoanRepaymentRecordedEvent } from '../../common/events/domain-events';
import { LoanJournalService } from './loan-journal.service';

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
  private readonly logger = new Logger(FinanceEventListener.name);

  constructor(
    private readonly journalService: JournalService,
    private readonly config: ConfigService,
    private readonly loanJournals: LoanJournalService,
  ) {}

  // Loan postings never block the loan itself: if one fails (closed month, missing account)
  // it is logged and "Put loans in the books" on the Loans page catches it up later.
  @OnEvent(DomainEvents.LoanDisbursed)
  async onLoanDisbursed(event: LoanDisbursedEvent): Promise<void> {
    try {
      await this.loanJournals.postDisbursement(event);
    } catch (e) {
      this.logger.error(`Could not post loan ${event.loanRef} payout to the books: ${(e as Error).message}`);
    }
  }

  @OnEvent(DomainEvents.LoanRepaymentRecorded)
  async onLoanRepayment(event: LoanRepaymentRecordedEvent): Promise<void> {
    try {
      await this.loanJournals.postRepayment(event);
    } catch (e) {
      this.logger.error(`Could not post loan ${event.loanRef} repayment to the books: ${(e as Error).message}`);
    }
  }

  /**
   * AG payroll deductions for month M arrive around the 10th of M+1. If
   * the whole premium were booked on the day the file is uploaded, the
   * income would land in the wrong month. So a deduction for an earlier
   * month is booked in two steps:
   *   1. on the last day of the premium month: Dr Premium Receivable, Cr Premium Income
   *   2. on the day it is posted:              Dr Bank,               Cr Premium Receivable
   * Income is then in the month the cover was for, and cash in the month
   * the money arrived. If the premium month is already closed, or the
   * receivable account does not exist, it falls back to one entry dated today.
   */
  private async postPayrollAccrual(event: PaymentPostedEvent, drAccount: string, today: string): Promise<boolean> {
    // Only AG deductions (a policy with a payroll pincode) arrive a month late.
    if (event.paymentMethod !== 'Payroll Deduction' || !(event.payrollPinCode && String(event.payrollPinCode).trim()) || !(event.amountMajor > 0)) return false;
    if (!/^\d{4}-\d{2}$/.test(event.paymentMonth || '')) return false;
    const [y, m] = event.paymentMonth.split('-').map(Number);
    const monthEnd = `${event.paymentMonth}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
    if (monthEnd >= today) return false; // current or future month: nothing to move
    const receivable = this.config.get<string>('finance.payrollReceivableAccount') || '1100';
    if (!(await this.journalService.accountExists(receivable))) return false;
    try {
      await this.journalService.assertPeriodOpen(monthEnd);
    } catch {
      return false; // premium month closed: book it today instead
    }
    const who = `${event.clientName} (${event.policyNumber}) ${event.paymentMonth}`;
    await this.journalService.post(
      monthEnd,
      `Premium earned - AG payroll deduction - ${who}`,
      [
        { accountCode: receivable, debit: event.amountMajor, credit: 0 },
        { accountCode: '4000', debit: 0, credit: event.amountMajor },
      ],
      'field-collection-wallet',
      event.paymentId,
      null,
    );
    await this.journalService.post(
      today,
      `AG payroll deduction received - ${who}`,
      [
        { accountCode: drAccount, debit: event.amountMajor, credit: 0 },
        { accountCode: receivable, debit: 0, credit: event.amountMajor },
      ],
      'field-collection-wallet',
      event.paymentId,
      null,
    );
    return true;
  }

  @OnEvent(DomainEvents.PaymentPosted)
  async onPaymentPosted(event: PaymentPostedEvent): Promise<void> {
    const drAccount = CASH_ACCOUNT_BY_METHOD[event.paymentMethod] ?? '1010';
    const today = new Date().toISOString().slice(0, 10);
    if (await this.postPayrollAccrual(event, drAccount, today)) return;
    await this.journalService.post(
      today,
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

  @OnEvent(DomainEvents.PaymentReversed)
  async onPaymentReversed(event: { paymentId: string; receiptNo: string; actor: any }): Promise<void> {
    try {
      const n = await this.journalService.reverseBySource('field-collection-wallet', event.paymentId, `Payment ${event.receiptNo} reversed`, event.actor ?? null);
      this.logger.log(`Reversed ${n} journal entr${n === 1 ? 'y' : 'ies'} for payment ${event.receiptNo}`);
    } catch (e) {
      this.logger.error(`Could not reverse the journal for payment ${event.receiptNo}: ${(e as Error).message}`);
    }
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
