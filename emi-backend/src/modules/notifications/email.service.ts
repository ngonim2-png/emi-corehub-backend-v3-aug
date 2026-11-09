import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Repository } from 'typeorm';
import { Queue } from 'bullmq';
import { EmailLogEntity } from './email-log.entity';
import { ClientEntity } from '../clients-policies/entities/client.entity';
import { EMAIL_GATEWAY, EmailGatewayAdapter } from './adapters/email-gateway.adapter';

export interface QueueEmailInput {
  toEmail: string;
  subject: string;
  body: string;
  relatedType?: string;
  relatedId?: string | null;
}

@Injectable()
export class EmailService {
  constructor(
    @InjectRepository(EmailLogEntity) private readonly emailLogRepo: Repository<EmailLogEntity>,
    @InjectRepository(ClientEntity) private readonly clientsRepo: Repository<ClientEntity>,
    @InjectQueue('email') private readonly emailQueue: Queue,
    @Inject(EMAIL_GATEWAY) private readonly gateway: EmailGatewayAdapter,
  ) {}

  async queueEmail(input: QueueEmailInput): Promise<EmailLogEntity> {
    const log = await this.emailLogRepo.save(
      this.emailLogRepo.create({
        toEmail: input.toEmail, subject: input.subject, body: input.body,
        relatedType: input.relatedType, relatedId: input.relatedId ?? null, status: 'Queued',
      }),
    );
    await this.emailQueue.add(
      'send-email',
      { emailLogId: log.id, toEmail: input.toEmail, subject: input.subject, body: input.body },
      { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
    );
    return log;
  }

  async processSend(emailLogId: string, toEmail: string, subject: string, body: string): Promise<void> {
    const result = await this.gateway.send(toEmail, subject, body);
    await this.emailLogRepo.update(emailLogId, {
      status: result.status, providerMessageId: result.providerMessageId,
    });
  }

  async findLogs(limit = 100): Promise<EmailLogEntity[]> {
    return this.emailLogRepo.find({ order: { createdAt: 'DESC' }, take: limit });
  }

  /**
   * The group/corporate use case this exists for: an employer or group
   * sponsors a policy for their staff, and the HR contact is who needs
   * to hear about it - not each individual retail client. Targets every
   * client under that employerOrGroup value that has an email on file.
   */
  async sendToGroup(employerOrGroup: string, subject: string, body: string): Promise<{ recipientCount: number }> {
    const recipients = await this.clientsRepo.find({ where: { employerOrGroup } });
    const withEmail = recipients.filter((c) => c.email);
    if (withEmail.length === 0) {
      throw new BadRequestException(`No clients under "${employerOrGroup}" have an email address on file.`);
    }
    for (const client of withEmail) {
      await this.queueEmail({ toEmail: client.email, subject, body, relatedType: 'group', relatedId: null });
    }
    return { recipientCount: withEmail.length };
  }
}
