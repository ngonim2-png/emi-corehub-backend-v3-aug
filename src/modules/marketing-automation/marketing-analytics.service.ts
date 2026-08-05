import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LeadEntity } from '../crm/entities/lead.entity';
import { ClientEntity } from '../clients-policies/entities/client.entity';
import { SmsCampaignEntity } from '../notifications/sms-campaign.entity';
import { TriggerFireEntity, LifecycleTriggerEntity } from './entities/lifecycle-trigger.entity';

@Injectable()
export class MarketingAnalyticsService {
  constructor(
    @InjectRepository(LeadEntity) private readonly leadsRepo: Repository<LeadEntity>,
    @InjectRepository(ClientEntity) private readonly clientsRepo: Repository<ClientEntity>,
    @InjectRepository(SmsCampaignEntity) private readonly campaignsRepo: Repository<SmsCampaignEntity>,
    @InjectRepository(TriggerFireEntity) private readonly firesRepo: Repository<TriggerFireEntity>,
    @InjectRepository(LifecycleTriggerEntity) private readonly triggersRepo: Repository<LifecycleTriggerEntity>,
  ) {}

  /** Lead funnel by source: how many came in, how many converted, and the conversion rate - the number that actually tells you which channel is worth the money. */
  async leadsBySource() {
    const rows = await this.leadsRepo
      .createQueryBuilder('lead')
      .select("COALESCE(lead.source, 'Unspecified')", 'source')
      .addSelect('COUNT(*)', 'total')
      .addSelect("COUNT(*) FILTER (WHERE lead.status = 'Converted')", 'converted')
      .groupBy('lead.source')
      .orderBy('total', 'DESC')
      .getRawMany();
    return rows.map((r) => ({
      source: r.source,
      total: Number(r.total),
      converted: Number(r.converted),
      conversionRate: Number(r.total) > 0 ? Number(r.converted) / Number(r.total) : 0,
    }));
  }

  /** New -> Contacted -> Converted/Lost - where leads actually are right now, not just where they ended up historically. */
  async leadFunnel() {
    const rows = await this.leadsRepo
      .createQueryBuilder('lead')
      .select('lead.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('lead.status')
      .getRawMany();
    const byStatus: Record<string, number> = { New: 0, Contacted: 0, Converted: 0, Lost: 0 };
    rows.forEach((r) => { byStatus[r.status] = Number(r.count); });
    return byStatus;
  }

  async campaignPerformance() {
    const campaigns = await this.campaignsRepo.find({ order: { createdAt: 'DESC' }, take: 20 });
    const totals = campaigns.reduce(
      (acc, c) => ({
        totalCampaigns: acc.totalCampaigns + 1,
        totalRecipients: acc.totalRecipients + c.recipientCount,
        totalSent: acc.totalSent + c.sentCount,
        totalFailed: acc.totalFailed + c.failedCount,
      }),
      { totalCampaigns: 0, totalRecipients: 0, totalSent: 0, totalFailed: 0 },
    );
    return { ...totals, recent: campaigns.map((c) => ({ id: c.id, name: c.name, recipientCount: c.recipientCount, sentCount: c.sentCount, status: c.status, createdAt: c.createdAt })) };
  }

  async triggerPerformance() {
    const triggers = await this.triggersRepo.find();
    const results = [];
    for (const trigger of triggers) {
      const count = await this.firesRepo.count({ where: { triggerId: trigger.id } });
      results.push({ triggerId: trigger.id, name: trigger.name, triggerType: trigger.triggerType, active: trigger.active, totalFires: count });
    }
    return results;
  }

  async referralSummary() {
    const totalReferred = await this.clientsRepo
      .createQueryBuilder('client')
      .where('client."referredByClientId" IS NOT NULL')
      .getCount();
    const activeReferred = await this.clientsRepo
      .createQueryBuilder('client')
      .where('client."referredByClientId" IS NOT NULL')
      .andWhere('client.status = :status', { status: 'Active' })
      .getCount();
    return {
      totalReferred,
      activeReferred,
      conversionRate: totalReferred > 0 ? activeReferred / totalReferred : 0,
    };
  }

  async overview() {
    const [leadsBySource, leadFunnel, campaignPerformance, triggerPerformance, referralSummary] = await Promise.all([
      this.leadsBySource(),
      this.leadFunnel(),
      this.campaignPerformance(),
      this.triggerPerformance(),
      this.referralSummary(),
    ]);
    return { leadsBySource, leadFunnel, campaignPerformance, triggerPerformance, referralSummary };
  }
}
