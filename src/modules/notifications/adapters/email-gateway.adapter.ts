export interface SendEmailResult {
  providerMessageId: string;
  status: 'Sent' | 'Failed';
  error?: string;
}

/**
 * Every email provider (SendGrid, Postmark, plain SMTP, etc.) implements
 * this. Business logic only ever calls EMAIL_GATEWAY, never a concrete
 * provider class - see notifications.module.ts for the binding. Same
 * shape and same reasoning as SmsGatewayAdapter: wiring in a real
 * provider later is a change entirely inside the adapter.
 */
export interface EmailGatewayAdapter {
  send(to: string, subject: string, body: string): Promise<SendEmailResult>;
}

export const EMAIL_GATEWAY = 'EMAIL_GATEWAY';
