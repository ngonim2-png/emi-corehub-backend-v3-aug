import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationsService } from './notifications.service';
import { DomainEvents, PaymentPostedEvent, ClaimStatusEvent } from '../../common/events/domain-events';

function monthLabel(key: string): string {
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const [y, m] = key.split('-').map(Number);
  return `${names[m - 1]}-${y}`;
}

@Injectable()
export class NotificationsEventListener {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Automatic sending is gated behind sms.automaticEnabled (see
   * configuration.ts) - off by default. While it's off, every message
   * that would have gone out automatically is recorded as Pending
   * instead, so nothing is lost: it shows up in the SMS tab for a person
   * to review and send manually. Once that setting is turned on, the
   * exact same events go straight through to actually sending.
   */
  private async dispatch(input: Parameters<NotificationsService['queueSms']>[0]) {
    if (this.config.get<boolean>('sms.automaticEnabled')) {
      await this.notificationsService.queueSms(input);
    } else {
      await this.notificationsService.logPendingSms(input);
    }
  }

  @OnEvent(DomainEvents.PaymentPosted)
  async onPaymentPosted(event: PaymentPostedEvent): Promise<void> {
    const body = this.notificationsService.templatePaymentReceipt({
      clientName: event.clientName,
      amountFormatted: `NLe ${event.amountMajor.toFixed(2)}`,
      monthLabel: monthLabel(event.paymentMonth),
      policyNumber: event.policyNumber,
      companyName: 'Enhanced Mutual Insurance (SL) Ltd',
      receiptNo: event.receiptNo,
    });
    await this.dispatch({
      toPhone: event.clientPhone,
      relatedType: 'payment',
      relatedId: event.paymentId,
      templateCode: 'payment_receipt',
      body,
    });
  }

  @OnEvent(DomainEvents.ClaimApproved)
  @OnEvent(DomainEvents.ClaimPaid)
  async onClaimStatusChanged(event: ClaimStatusEvent): Promise<void> {
    await this.dispatch({
      toPhone: event.clientPhone,
      relatedType: 'claim',
      relatedId: event.claimId,
      templateCode: 'claim_status_update',
      body: `Dear ${event.clientName}, your claim under Policy No. ${event.policyNumber} is now ${event.status}.`,
    });
  }
}
