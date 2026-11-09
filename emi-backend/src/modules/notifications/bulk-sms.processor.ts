import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Job } from 'bullmq';
import { SmsLogEntity } from './sms-log.entity';
import { SmsCampaignEntity } from './sms-campaign.entity';
import { SMS_GATEWAY, SmsGatewayAdapter } from './adapters/sms-gateway.adapter';

interface SendCampaignJobData {
  campaignId: string;
  smsLogIds: string[];
}

/**
 * Runs a whole campaign as one job, calling gateway.sendBulk() once with
 * every recipient - this is the point where a real bulk API's efficiency
 * actually shows up (one batched call instead of one BullMQ job per
 * recipient). Individual send/delivery status still lands on each
 * recipient's own SmsLogEntity row, so nothing about how results are
 * tracked or displayed changes when a real provider is plugged in later.
 */
@Processor('bulk-sms')
export class BulkSmsProcessor extends WorkerHost {
  private readonly logger = new Logger(BulkSmsProcessor.name);

  constructor(
    @Inject(SMS_GATEWAY) private readonly gateway: SmsGatewayAdapter,
    @InjectRepository(SmsLogEntity) private readonly smsLogRepo: Repository<SmsLogEntity>,
    @InjectRepository(SmsCampaignEntity) private readonly campaignRepo: Repository<SmsCampaignEntity>,
  ) {
    super();
  }

  async process(job: Job<SendCampaignJobData>): Promise<void> {
    const { campaignId, smsLogIds } = job.data;
    await this.campaignRepo.update(campaignId, { status: 'Sending' });

    const logs = await this.smsLogRepo.find({ where: { id: In(smsLogIds) } });
    const recipients = logs.map((l) => ({ to: l.toPhone, body: l.body, smsLogId: l.id }));

    let results;
    try {
      results = await this.gateway.sendBulk(recipients);
    } catch (error) {
      this.logger.error(`Bulk send failed entirely for campaign ${campaignId}`, error as Error);
      await this.smsLogRepo.update({ id: In(smsLogIds) }, { status: 'Failed' });
      await this.campaignRepo.update(campaignId, {
        status: 'Failed', failedCount: smsLogIds.length, completedAt: new Date(),
      });
      throw error;
    }

    let sentCount = 0;
    let failedCount = 0;
    for (const result of results) {
      const ok = result.status === 'Sent';
      if (ok) sentCount++; else failedCount++;
      await this.smsLogRepo.update(result.smsLogId, {
        status: ok ? 'Sent' : 'Failed',
        sentAt: ok ? new Date() : null,
      });
    }

    await this.campaignRepo.update(campaignId, {
      status: failedCount === 0 ? 'Completed' : sentCount === 0 ? 'Failed' : 'Completed',
      sentCount, failedCount, completedAt: new Date(),
    });
  }
}
