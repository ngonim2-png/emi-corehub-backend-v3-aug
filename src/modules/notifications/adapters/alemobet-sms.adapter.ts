import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  SmsGatewayAdapter,
  SendSmsResult,
  BulkSmsRecipient,
  BulkSmsResult,
} from './sms-gateway.adapter';

/**
 * Real integration with Alemobet Limited's HTTP-to-SMPP bulk SMS API (see
 * Alemobet_SMS_API_Documentation.pdf). A few things about this specific
 * provider that shaped how this is built:
 *
 * - It's a plain HTTP GET with query parameters, not a JSON API, and the
 *   response is a pipe/comma-delimited text string, not JSON either.
 * - "Unicode" messages (type=2) have to be sent as the hex-encoded UTF-16
 *   code units of the string, not the text itself - see toUnicodeHex()
 *   below, which follows Alemobet's own Java sample code exactly for this.
 *   GSM 03.38-compatible plain text goes as-is (type=0).
 * - Their documentation is explicit: "Apart from 1709 [User validation
 *   failed], Please DO NOT RETRY re-sending the message for any other
 *   error code." Every other business failure here (bad destination, bad
 *   source, insufficient credit, etc.) is returned as a normal Failed
 *   result rather than thrown, specifically so SmsProcessor's BullMQ retry
 *   never fires for those. 1709 is the one case that does throw, which is
 *   what lets that retry happen.
 * - destination accepts a comma-separated list of numbers in one call,
 *   which is exactly the real bulk API sendBulk() is designed to plug
 *   into (see sms-gateway.adapter.ts) - no per-recipient looping needed.
 */

const ALEMOBET_ERROR_MESSAGES: Record<string, string> = {
  '1702': 'Invalid request - a required parameter was missing or blank.',
  '1703': 'Invalid Alemobet username or password.',
  '1704': 'Invalid message type.',
  '1705': 'Invalid message content.',
  '1706': 'Invalid destination number.',
  '1707': 'Invalid source/sender ID.',
  '1708': 'Invalid delivery report setting.',
  '1709': 'User validation failed.',
  '1710': 'Alemobet internal error.',
  '1025': 'Insufficient SMS credit on the Alemobet account.',
  '1715': 'Alemobet response timeout.',
};

/** Alemobet's documented "Unicode" wire format: each character's UTF-16 code unit as 4 hex digits, concatenated - matches their own Java sample's convertToUnicode() exactly. */
function toUnicodeHex(text: string): string {
  let hex = '';
  for (let i = 0; i < text.length; i++) {
    hex += text.charCodeAt(i).toString(16).padStart(4, '0');
  }
  return hex;
}

/** GSM 03.38's basic Latin range covers plain ASCII closely enough for this purpose - anything outside it needs the Unicode path. */
function isPlainTextSafe(text: string): boolean {
  return /^[\x00-\x7F]*$/.test(text);
}

interface ParsedSegment {
  errorCode: string;
  destination: string;
  messageId: string | null;
}

/** Handles both the normal per-recipient "code|destination|messageId" segments and the shorter "code|destination" abort-marker segments the docs describe for mid-batch SMPP outages or exhausted credit. */
function parseAlemobetResponse(raw: string): ParsedSegment[] {
  return raw
    .trim()
    .split(',')
    .filter((s) => s.length > 0)
    .map((segment) => {
      const parts = segment.split('|');
      return { errorCode: parts[0]?.trim() ?? '', destination: parts[1]?.trim() ?? '', messageId: parts[2]?.trim() ?? null };
    });
}

@Injectable()
export class AlemobetSmsAdapter implements SmsGatewayAdapter {
  private readonly logger = new Logger(AlemobetSmsAdapter.name);

  constructor(private readonly config: ConfigService) {}

  private buildUrl(destinations: string[], body: string): string {
    const server = this.config.get<string>('sms.alemobetServer');
    const port = this.config.get<number>('sms.alemobetPort');
    const username = this.config.get<string>('sms.alemobetUsername');
    const password = this.config.get<string>('sms.alemobetPassword');
    const source = this.config.get<string>('sms.senderId');

    const plainSafe = isPlainTextSafe(body);
    const type = plainSafe ? '0' : '2';
    const message = plainSafe ? body : toUnicodeHex(body);

    const params = new URLSearchParams({
      username: username ?? '',
      password: password ?? '',
      type,
      dlr: '1',
      destination: destinations.join(','),
      source: source ?? '',
      message,
    });
    return `http://${server}:${port}/bulksms/bulksms?${params.toString()}`;
  }

  private toResult(segment: ParsedSegment): SendSmsResult {
    if (segment.errorCode === '1701') {
      return { providerMessageId: segment.messageId ?? '', status: 'Sent' };
    }
    return {
      providerMessageId: '',
      status: 'Failed',
      error: ALEMOBET_ERROR_MESSAGES[segment.errorCode] ?? `Alemobet error ${segment.errorCode}`,
    };
  }

  async send(to: string, body: string): Promise<SendSmsResult> {
    const server = this.config.get<string>('sms.alemobetServer');
    if (!server) {
      this.logger.warn(`ALEMOBET_SERVER not configured - simulating send to ${to}`);
      return { providerMessageId: `sim-${Date.now()}`, status: 'Sent' };
    }

    const url = this.buildUrl([to], body);
    const response = await fetch(url);
    const raw = await response.text();
    const segments = parseAlemobetResponse(raw);
    const segment = segments[0];
    if (!segment) {
      return { providerMessageId: '', status: 'Failed', error: `Unexpected Alemobet response: ${raw}` };
    }

    // Per Alemobet's own instructions, 1709 is the one failure worth
    // retrying - throwing here is what lets SmsProcessor's BullMQ retry
    // policy take over for this specific case.
    if (segment.errorCode === '1709') {
      throw new Error(ALEMOBET_ERROR_MESSAGES['1709']);
    }
    return this.toResult(segment);
  }

  async sendBulk(recipients: BulkSmsRecipient[]): Promise<BulkSmsResult[]> {
    const server = this.config.get<string>('sms.alemobetServer');
    if (!server) {
      this.logger.warn(`ALEMOBET_SERVER not configured - simulating bulk send to ${recipients.length} recipient(s)`);
      return recipients.map((r) => ({
        smsLogId: r.smsLogId,
        providerMessageId: `sim-bulk-${Date.now()}-${r.smsLogId.slice(0, 8)}`,
        status: 'Sent' as const,
      }));
    }

    // Alemobet's real bulk endpoint takes one message body per call, with
    // multiple destinations comma-separated - it can't carry a different
    // body per recipient in a single request. Every message in this
    // system's own bulk sends already shares one body per campaign (see
    // NotificationsService.sendBulk), so recipients are grouped by body
    // and each distinct body gets its own single Alemobet call covering
    // every recipient who shares it, rather than one call per recipient.
    const byBody = new Map<string, BulkSmsRecipient[]>();
    for (const r of recipients) {
      const group = byBody.get(r.body) ?? [];
      group.push(r);
      byBody.set(r.body, group);
    }

    const results: BulkSmsResult[] = [];
    for (const [body, group] of byBody) {
      const url = this.buildUrl(group.map((r) => r.to), body);
      try {
        const response = await fetch(url);
        const raw = await response.text();
        const segments = parseAlemobetResponse(raw);
        // Match each result back to its recipient by destination number,
        // in the order Alemobet returns them - falls back to positional
        // matching if a destination doesn't line up cleanly, so a partial
        // or reordered response still resolves every recipient in the
        // group rather than silently dropping some of them.
        const byDestination = new Map(segments.map((s) => [s.destination, s]));
        group.forEach((recipient, i) => {
          const segment = byDestination.get(recipient.to) ?? segments[i];
          if (!segment) {
            results.push({ smsLogId: recipient.smsLogId, providerMessageId: '', status: 'Failed', error: 'No response for this destination.' });
            return;
          }
          const result = this.toResult(segment);
          results.push({ smsLogId: recipient.smsLogId, ...result });
        });
      } catch (error) {
        for (const recipient of group) {
          results.push({ smsLogId: recipient.smsLogId, providerMessageId: '', status: 'Failed', error: (error as Error).message });
        }
      }
    }
    return results;
  }
}
