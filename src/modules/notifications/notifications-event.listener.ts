import { Injectable } from '@nestjs/common';
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
  constructor(private readonly notificationsService: NotificationsService) {}

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
    await this.notificationsService.queueSms({
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
    await this.notificationsService.queueSms({
      toPhone: event.clientPhone,
      relatedType: 'claim',
      relatedId: event.claimId,
      templateCode: 'claim_status_update',
      body: `Dear ${event.clientName}, your claim under Policy No. ${event.policyNumber} is now ${event.status}.`,
    });
  }
}
