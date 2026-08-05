import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { EmailService } from './email.service';

interface SendEmailJobData {
  emailLogId: string;
  toEmail: string;
  subject: string;
  body: string;
}

@Processor('email')
export class EmailProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailProcessor.name);

  constructor(private readonly emailService: EmailService) {
    super();
  }

  async process(job: Job<SendEmailJobData>): Promise<void> {
    const { emailLogId, toEmail, subject, body } = job.data;
    try {
      await this.emailService.processSend(emailLogId, toEmail, subject, body);
    } catch (error) {
      this.logger.error(`Email send failed for log ${emailLogId}`, error as Error);
      throw error;
    }
  }
}
