import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job } from 'bullmq';
import { SmsLogEntity } from './sms-log.entity';
import { SMS_GATEWAY, SmsGatewayAdapter } from './adapters/sms-gateway.adapter';

interface SendSmsJobData {
  smsLogId: string;
  toPhone: string;
  body: string;
}

@Processor('sms')
export class SmsProcessor extends WorkerHost {
  private readonly logger = new Logger(SmsProcessor.name);

  constructor(
    @Inject(SMS_GATEWAY) private readonly gateway: SmsGatewayAdapter,
    @InjectRepository(SmsLogEntity) private readonly smsLogRepo: Repository<SmsLogEntity>,
  ) {
    super();
  }

  async process(job: Job<SendSmsJobData>): Promise<void> {
    const { smsLogId, toPhone, body } = job.data;
    try {
      const result = await this.gateway.send(toPhone, body);
      await this.smsLogRepo.update(smsLogId, {
        status: result.status === 'Sent' ? 'Sent' : 'Failed',
        sentAt: new Date(),
      });
    } catch (error) {
      this.logger.error(`SMS send failed for log ${smsLogId}`, error as Error);
      await this.smsLogRepo.update(smsLogId, { status: 'Failed' });
      throw error; // lets BullMQ's retry/backoff policy take over
    }
  }
}
