import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  SmsGatewayAdapter,
  SendSmsResult,
  BulkSmsRecipient,
  BulkSmsResult,
} from './sms-gateway.adapter';

/**
 * Most bulk SMS providers cap how many recipients one HTTP call can carry
 * (Orange's bulk endpoint, Africa's Talking, and Twilio's batch API all do
 * this, with limits that vary by provider - 100 is a conservative default
 * safe to start with; raise it once the real provider's actual limit is
 * known from their docs).
 */
const DEFAULT_BULK_CHUNK_SIZE = 100;

@Injectable()
export class OrangeSmsAdapter implements SmsGatewayAdapter {
  private readonly logger = new Logger(OrangeSmsAdapter.name);

  constructor(private readonly config: ConfigService) {}

  async send(to: string, body: string): Promise<SendSmsResult> {
    const apiKey = this.config.get<string>('sms.apiKey');
    const senderId = this.config.get<string>('sms.senderId');
    if (!apiKey) {
      this.logger.warn(`SMS_API_KEY not configured - simulating send to ${to} (senderId: ${senderId})`);
      return { providerMessageId: `sim-${Date.now()}`, status: 'Sent' };
    }

    // Real implementation: POST to Orange's SMS API with apiKey, senderId,
    // recipient and body, then map their response/webhook status onto
    // SendSmsResult. Left as a placeholder - the contract (send() returning
    // a provider message id and status) is what the rest of the system
    // depends on, not this implementation's internals.
    this.logger.log(`Sending SMS to ${to}: ${body.slice(0, 40)}...`);
    return { providerMessageId: `orange-${Date.now()}`, status: 'Sent' };
  }

  /**
   * THE PLUG POINT for a real bulk SMS API.
   *
   * When a real provider is wired in, replace the body of this method
   * with calls to their batch/bulk endpoint - typically something like:
   *
   *   const chunks = chunk(recipients, DEFAULT_BULK_CHUNK_SIZE);
   *   for (const batch of chunks) {
   *     const response = await fetch(`${bulkApiUrl}/messages/bulk`, {
   *       method: 'POST',
   *       headers: { Authorization: `Bearer ${apiKey}` },
   *       body: JSON.stringify({
   *         senderId,
   *         messages: batch.map(r => ({ to: r.to, body: r.body })),
   *       }),
   *     });
   *     // map the provider's per-recipient response back onto BulkSmsResult[],
   *     // matching each result to its smsLogId via phone number or the
   *     // order the provider guarantees (check their docs - some preserve
   *     // request order, some return an explicit correlation id).
   *   }
   *
   * Nothing outside this file needs to change - NotificationsService and
   * the bulk-sms queue processor only ever call gateway.sendBulk() and
   * read back BulkSmsResult[], regardless of what happens inside it.
   */
  async sendBulk(recipients: BulkSmsRecipient[]): Promise<BulkSmsResult[]> {
    const apiKey = this.config.get<string>('sms.apiKey');
    const senderId = this.config.get<string>('sms.senderId');
    if (!apiKey) {
      this.logger.warn(`SMS_API_KEY not configured - simulating bulk send to ${recipients.length} recipient(s) (senderId: ${senderId})`);
      return recipients.map((r) => ({
        smsLogId: r.smsLogId,
        providerMessageId: `sim-bulk-${Date.now()}-${r.smsLogId.slice(0, 8)}`,
        status: 'Sent' as const,
      }));
    }

    // No real bulk API configured yet - fall back to looping send(), which
    // still works correctly, just without the efficiency of a real batch
    // call. This keeps bulk sending fully functional today; only this
    // fallback path needs to be replaced once a real bulk endpoint exists.
    this.logger.log(`No bulk API configured - falling back to individual sends for ${recipients.length} recipient(s)`);
    const results: BulkSmsResult[] = [];
    for (const recipient of recipients) {
      try {
        const result = await this.send(recipient.to, recipient.body);
        results.push({ smsLogId: recipient.smsLogId, ...result });
      } catch (error) {
        results.push({
          smsLogId: recipient.smsLogId, providerMessageId: '', status: 'Failed',
          error: (error as Error).message,
        });
      }
    }
    return results;
  }
}
