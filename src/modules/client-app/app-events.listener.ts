import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { OnEvent } from '@nestjs/event-emitter';
import { Repository } from 'typeorm';
import { DomainEvents, PaymentPostedEvent, ClaimStatusChangedEvent, LoanStatusChangedEvent } from '../../common/events/domain-events';
import { AppPushService } from './app-push.service';
import { AppApplicantEntity } from './entities/app-applicant.entity';
import { ClientAppAccountEntity } from './entities/client-app-account.entity';

const CLAIM_TEXT: Record<string, string> = {
  'Under Review': 'is now under review',
  Approved: 'has been approved',
  Paid: 'has been paid',
  Rejected: 'could not be approved. Please contact the office',
};
const LOAN_TEXT: Record<string, string> = {
  'Pending Finance Director Approval': 'passed the first approval and is waiting for final approval',
  Approved: 'is fully approved and will be disbursed shortly',
  Disbursed: 'has been disbursed',
  Rejected: 'was not approved. Please contact the office',
};

function monthLabel(key: string): string {
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const [y, m] = key.split('-').map(Number);
  return `${names[m - 1]} ${y}`;
}

/**
 * Push notifications for things that happen to a client's own business
 * (their payment, their claim, their loan). These are direct, one-to-one
 * status messages, unlike bulk marketing SMS which stays manual. Each
 * handler swallows its own errors: a failed notification must never fail
 * the payment/claim/loan action that triggered it.
 */
@Injectable()
export class AppEventsListener {
  private readonly logger = new Logger(AppEventsListener.name);

  constructor(
    private readonly push: AppPushService,
    @InjectRepository(AppApplicantEntity) private readonly applicantsRepo: Repository<AppApplicantEntity>,
    @InjectRepository(ClientAppAccountEntity) private readonly accountsRepo: Repository<ClientAppAccountEntity>,
  ) {}

  @OnEvent(DomainEvents.PaymentPosted)
  async onPayment(e: PaymentPostedEvent) {
    try {
      const acc = await this.accountsRepo.findOne({ where: { clientId: e.clientId } });
      if (acc) {
        await this.push.notify('client', e.clientId, 'Payment received', `We received NLe ${e.amountMajor.toFixed(2)} for ${monthLabel(e.paymentMonth)} on policy ${e.policyNumber}. Receipt ${e.receiptNo}. Thank you.`);
      }
      // A new applicant's very first premium is what opens their client access.
      const applicant = await this.applicantsRepo.findOne({ where: { clientId: e.clientId } });
      if (applicant && acc?.origin === 'application') {
        await this.push.notify('applicant', applicant.id, 'Your policy is active', `We received your first premium. You can now log in with your policy number ${e.policyNumber} and your PIN to see your policy, make claims and more.`);
      }
    } catch (err) {
      this.logger.warn(`Payment push failed: ${(err as Error).message}`);
    }
  }

  @OnEvent(DomainEvents.ClaimStatusChanged)
  async onClaim(e: ClaimStatusChangedEvent) {
    try {
      const text = CLAIM_TEXT[e.status];
      if (text) await this.push.notify('client', e.clientId, 'Claim update', `Your claim ${e.claimNo} ${text}.`);
    } catch (err) {
      this.logger.warn(`Claim push failed: ${(err as Error).message}`);
    }
  }

  @OnEvent(DomainEvents.LoanStatusChanged)
  async onLoan(e: LoanStatusChangedEvent) {
    try {
      const text = LOAN_TEXT[e.status];
      if (text && e.clientId) await this.push.notify('client', e.clientId, 'Loan update', `Your loan of NLe ${e.amountMajor.toFixed(2)} ${text}.`);
    } catch (err) {
      this.logger.warn(`Loan push failed: ${(err as Error).message}`);
    }
  }
}
