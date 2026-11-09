import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { SmsLogEntity } from './sms-log.entity';
import { SmsCampaignEntity } from './sms-campaign.entity';
import { ClientEntity } from '../clients-policies/entities/client.entity';
import { UserEntity } from '../identity-access/entities/user.entity';
import { SendBulkSmsDto } from './dto/send-bulk-sms.dto';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { PoliciesService } from '../clients-policies/policies.service';

export interface QueueSmsInput {
  toPhone: string;
  relatedType: string;
  relatedId: string | null;
  templateCode: string;
  body: string;
}

/** A single bulk send is capped here - a campaign larger than this should be split into batches by whoever's sending it, the same way bulk payment CSV uploads are capped. */
const MAX_BULK_RECIPIENTS = 5000;

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(SmsLogEntity) private readonly smsLogRepo: Repository<SmsLogEntity>,
    @InjectRepository(SmsCampaignEntity) private readonly campaignRepo: Repository<SmsCampaignEntity>,
    @InjectRepository(ClientEntity) private readonly clientsRepo: Repository<ClientEntity>,
    @InjectRepository(UserEntity) private readonly usersRepo: Repository<UserEntity>,
    @InjectQueue('sms') private readonly smsQueue: Queue,
    @InjectQueue('bulk-sms') private readonly bulkSmsQueue: Queue,
    private readonly policiesService: PoliciesService,
  ) {}

  async queueSms(input: QueueSmsInput): Promise<SmsLogEntity> {
    const log = await this.smsLogRepo.save(
      this.smsLogRepo.create({ ...input, status: 'Queued' }),
    );
    await this.smsQueue.add(
      'send-sms',
      { smsLogId: log.id, toPhone: input.toPhone, body: input.body },
      { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
    );
    return log;
  }

  /**
   * For automatically-triggered messages (payment receipts, claim status
   * updates) while automatic sending is restricted - records exactly what
   * would have gone out and why, but doesn't actually send it. Nothing is
   * lost: it shows up in the Pending SMS queue for a person to review and
   * send manually. See NotificationsEventListener for where this is used
   * instead of queueSms().
   */
  async logPendingSms(input: QueueSmsInput): Promise<SmsLogEntity> {
    return this.smsLogRepo.save(this.smsLogRepo.create({ ...input, status: 'Pending' }));
  }

  async listPending(): Promise<SmsLogEntity[]> {
    return this.smsLogRepo.find({ where: { status: 'Pending' }, order: { createdAt: 'DESC' } });
  }

  /** Turns a Pending log entry into an actual send - the explicit human trigger. */
  async sendPendingSms(id: string): Promise<SmsLogEntity> {
    const log = await this.smsLogRepo.findOne({ where: { id } });
    if (!log) throw new BadRequestException('SMS log entry not found.');
    if (log.status !== 'Pending') throw new BadRequestException('This message is not pending - it may have already been sent.');
    await this.smsLogRepo.update(id, { status: 'Queued' });
    await this.smsQueue.add(
      'send-sms',
      { smsLogId: log.id, toPhone: log.toPhone, body: log.body },
      { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
    );
    return this.smsLogRepo.findOneOrFail({ where: { id } });
  }

  /** Sends every currently-pending message - for clearing a backlog in one action rather than one at a time. */
  async sendAllPending(): Promise<{ sent: number }> {
    const pending = await this.listPending();
    for (const log of pending) {
      await this.sendPendingSms(log.id);
    }
    return { sent: pending.length };
  }

  templatePaymentReceipt(params: {
    clientName: string;
    amountFormatted: string;
    monthLabel: string;
    policyNumber: string;
    companyName: string;
    receiptNo: string;
  }): string {
    return (
      `Dear ${params.clientName}, your premium payment of ${params.amountFormatted} for ` +
      `${params.monthLabel} under Policy No. ${params.policyNumber} has been received by ` +
      `${params.companyName}. Receipt No: ${params.receiptNo}. Thank you.`
    );
  }

  /** Resolves an audience selection into a deduplicated list of phone numbers. Never sends anything by itself - callers use this to preview a count or to build the recipient list before queuing. */
  /**
   * The actual member list for a policy-based audience segment - name,
   * phone, and the one relevant detail for that segment, so the frontend
   * can show a real reviewable list rather than just a blind count.
   * Reuses the exact same computed status (PoliciesService.computedReport)
   * and renewal-window logic the Register, Unpaid, Lapse, and Renewals
   * screens already use, so "lapsed" or "pending premium" here always
   * means the same thing it means everywhere else in the system.
   */
  async findSegmentMembers(
    segment: 'all' | 'pendingPremium' | 'lapsed' | 'renewal',
    renewalWithinDays = 60,
  ): Promise<{ clientId: string; clientName: string; phone: string; policyNo: string; detail: string }[]> {
    if (segment === 'renewal') {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() + renewalWithinDays);
      const cutoffStr = cutoff.toISOString().slice(0, 10);
      const policies = await this.policiesService.findAllWithClientAndProduct();
      return policies
        .filter((p) => p.maturityDate && p.maturityDate <= cutoffStr && p.client.smsConsent)
        .map((p) => ({
          clientId: p.client.id, clientName: p.client.fullName, phone: p.client.phone,
          policyNo: p.policyNo, detail: `Matures ${p.maturityDate}`,
        }));
    }

    const rows = await this.policiesService.computedReport();
    const consented = rows.filter((r) => r.clientSmsConsent);
    const matched = segment === 'all' ? consented
      : segment === 'pendingPremium' ? consented.filter((r) => r.totalOutstanding > 0)
      : consented.filter((r) => r.status === 'Lapsed');

    return matched.map((r) => ({
      clientId: r.clientId, clientName: r.clientName, phone: r.clientPhone, policyNo: r.policyNo,
      detail: segment === 'pendingPremium' ? `Outstanding: NLe ${r.totalOutstanding.toFixed(2)}` : r.status,
    }));
  }

  async resolveAudience(dto: Pick<SendBulkSmsDto, 'audienceType' | 'filters' | 'customPhones'>): Promise<string[]> {
    let phones: string[] = [];

    if (dto.audienceType === 'custom') {
      phones = dto.customPhones ?? [];
    } else if (dto.audienceType === 'clients') {
      const qb = this.clientsRepo.createQueryBuilder('client').where('client.smsConsent = true');
      if (dto.filters?.district) qb.andWhere('client.district = :district', { district: dto.filters.district });
      if (dto.filters?.status) qb.andWhere('client.status = :status', { status: dto.filters.status });
      const clients = await qb.getMany();
      phones = clients.map((c) => c.phone);
    } else if (dto.audienceType === 'marketers') {
      const users = await this.usersRepo.find({ relations: ['role'] });
      phones = users.filter((u) => u.role?.name === 'Marketer / Agent' && u.phone).map((u) => u.phone);
    }

    return Array.from(new Set(phones.filter(Boolean)));
  }

  /**
   * Creates the campaign record, creates one SmsLogEntity row per
   * recipient up front (so they're immediately visible in SMS Logs as
   * "Queued", not hidden until the batch job picks them up), then queues
   * a single bulk-sms job that does the actual sending - see
   * bulk-sms.processor.ts for where gateway.sendBulk() gets called.
   */
  async sendBulk(dto: SendBulkSmsDto, actor: AuthenticatedUser): Promise<SmsCampaignEntity> {
    const phones = await this.resolveAudience(dto);
    if (phones.length === 0) {
      throw new BadRequestException('No recipients matched this audience - nothing was queued.');
    }
    if (phones.length > MAX_BULK_RECIPIENTS) {
      throw new BadRequestException(
        `${phones.length} recipients exceeds the ${MAX_BULK_RECIPIENTS}-recipient limit for a single campaign - split into smaller batches.`,
      );
    }

    const campaign = await this.campaignRepo.save(
      this.campaignRepo.create({
        name: dto.name, message: dto.message, audienceType: dto.audienceType,
        audienceFilters: dto.filters ? { ...dto.filters } as Record<string, unknown> : null,
        recipientCount: phones.length,
        status: 'Queued', createdBy: actor.id,
      }),
    );

    const logs = await this.smsLogRepo.save(
      phones.map((phone) =>
        this.smsLogRepo.create({
          toPhone: phone, relatedType: 'campaign', relatedId: campaign.id,
          templateCode: 'BULK_CAMPAIGN', body: dto.message, status: 'Queued',
        }),
      ),
    );

    await this.bulkSmsQueue.add(
      'send-campaign',
      { campaignId: campaign.id, smsLogIds: logs.map((l) => l.id) },
      { attempts: 2, backoff: { type: 'exponential', delay: 10000 } },
    );

    return campaign;
  }

  async findCampaigns(limit = 50): Promise<SmsCampaignEntity[]> {
    return this.campaignRepo.find({ order: { createdAt: 'DESC' }, take: limit });
  }

  async findCampaign(id: string): Promise<{ campaign: SmsCampaignEntity; logs: SmsLogEntity[] }> {
    const campaign = await this.campaignRepo.findOneOrFail({ where: { id } });
    const logs = await this.smsLogRepo.find({ where: { relatedType: 'campaign', relatedId: id }, order: { createdAt: 'ASC' } });
    return { campaign, logs };
  }
}
