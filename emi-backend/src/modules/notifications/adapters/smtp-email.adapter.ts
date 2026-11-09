import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailGatewayAdapter, SendEmailResult } from './email-gateway.adapter';

@Injectable()
export class SmtpEmailAdapter implements EmailGatewayAdapter {
  private readonly logger = new Logger(SmtpEmailAdapter.name);

  constructor(private readonly config: ConfigService) {}

  async send(to: string, subject: string, body: string): Promise<SendEmailResult> {
    const apiKey = this.config.get<string>('email.apiKey');
    if (!apiKey) {
      this.logger.warn(`EMAIL_API_KEY not configured - simulating send to ${to}: "${subject}"`);
      return { providerMessageId: `sim-email-${Date.now()}`, status: 'Sent' };
    }

    // Real implementation: send via SMTP (nodemailer) or a provider API
    // (SendGrid, Postmark, etc.) using apiKey/fromAddress from config,
    // then map the response onto SendEmailResult. Left as a placeholder -
    // the contract is what the rest of the system depends on.
    void body;
    this.logger.warn('Real email sending not yet implemented - update this adapter when a provider is chosen.');
    return { providerMessageId: `unimplemented-${Date.now()}`, status: 'Failed', error: 'Real email provider not configured' };
  }
}
