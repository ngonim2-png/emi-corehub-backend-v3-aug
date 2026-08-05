export interface SendSmsResult {
  providerMessageId: string;
  status: 'Sent' | 'Failed';
  error?: string;
}

export interface BulkSmsRecipient {
  to: string;
  body: string;
  /** Correlates a bulk result row back to the SmsLogEntity that requested it. */
  smsLogId: string;
}

export interface BulkSmsResult {
  smsLogId: string;
  providerMessageId: string;
  status: 'Sent' | 'Failed';
  error?: string;
}

/**
 * Every SMS provider implements this. Business logic (payment receipts,
 * arrears reminders, lapse warnings, bulk campaigns) only ever calls
 * SMS_GATEWAY, never a concrete provider class - see notifications.module.ts
 * for the binding.
 *
 * sendBulk() is the plug point for a real bulk SMS API: most providers
 * (Orange, Africa's Talking, Hubtel, Twilio's batch endpoint, etc.) accept
 * many recipients in a single HTTP call, which is both faster and usually
 * billed cheaper than one call per recipient. Until a real bulk API is
 * wired in, the default implementation below just loops send() - so bulk
 * sending works correctly today, and swapping in a real batched call later
 * is a change entirely inside the adapter, with nothing above this
 * interface needing to change.
 */
export interface SmsGatewayAdapter {
  send(to: string, body: string): Promise<SendSmsResult>;
  sendBulk(recipients: BulkSmsRecipient[]): Promise<BulkSmsResult[]>;
}

export const SMS_GATEWAY = 'SMS_GATEWAY';
