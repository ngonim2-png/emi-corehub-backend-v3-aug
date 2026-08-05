import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { LeadEntity } from './entities/lead.entity';
import { ComplaintEntity, CrmInteractionEntity } from './entities/complaint.entity';
import { ClientEntity } from '../clients-policies/entities/client.entity';
import { UserEntity } from '../identity-access/entities/user.entity';
import { CreateLeadDto, CreateComplaintDto, LogInteractionDto } from './dto/crm.dto';
import { DomainEvents } from '../../common/events/domain-events';

/**
 * Weighted, transparent, and deliberately simple - a marketer should be
 * able to look at a lead and understand exactly why it scored what it
 * did, not treat this as a black box. Tune these weights with real
 * conversion data once there's enough of it to tune against.
 */
const SOURCE_WEIGHTS: Record<string, number> = {
  Referral: 30,
  'Field visit': 20,
  'Walk-in': 15,
  Campaign: 10,
};
const RECENCY_BONUS_DAYS = 3; // a lead less than this many days old gets a freshness bonus
const RECENCY_BONUS = 15;

@Injectable()
export class CrmService {
  constructor(
    @InjectRepository(LeadEntity) private readonly leadsRepo: Repository<LeadEntity>,
    @InjectRepository(ComplaintEntity) private readonly complaintsRepo: Repository<ComplaintEntity>,
    @InjectRepository(CrmInteractionEntity) private readonly interactionsRepo: Repository<CrmInteractionEntity>,
    @InjectRepository(ClientEntity) private readonly clientsRepo: Repository<ClientEntity>,
    @InjectRepository(UserEntity) private readonly usersRepo: Repository<UserEntity>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  computeScore(lead: { source?: string | null; createdAt?: Date }): number {
    let score = 10; // baseline - every lead is worth looking at
    if (lead.source && SOURCE_WEIGHTS[lead.source]) score += SOURCE_WEIGHTS[lead.source];
    const ageDays = (Date.now() - new Date(lead.createdAt ?? Date.now()).getTime()) / (1000 * 60 * 60 * 24);
    if (ageDays <= RECENCY_BONUS_DAYS) score += RECENCY_BONUS;
    return score;
  }

  /** Load-balanced, not strict round-robin: assigns to whichever marketer currently has the fewest open (New/Contacted) leads, so assignment self-corrects instead of drifting uneven over time. */
  private async pickMarketerForAssignment(): Promise<string | null> {
    const marketers = await this.usersRepo.find({ relations: ['role'] });
    const marketerIds = marketers.filter((u) => u.role?.name === 'Marketer / Agent').map((u) => u.id);
    if (marketerIds.length === 0) return null;

    const openLeads = await this.leadsRepo.find({ where: [{ status: 'New' }, { status: 'Contacted' }] });
    const loadByMarketer = new Map(marketerIds.map((id) => [id, 0]));
    openLeads.forEach((l) => {
      if (l.assignedTo && loadByMarketer.has(l.assignedTo)) {
        loadByMarketer.set(l.assignedTo, (loadByMarketer.get(l.assignedTo) ?? 0) + 1);
      }
    });
    return [...loadByMarketer.entries()].sort((a, b) => a[1] - b[1])[0][0];
  }

  async createLead(dto: CreateLeadDto): Promise<LeadEntity> {
    const now = new Date();
    const score = this.computeScore({ source: dto.source, createdAt: now });
    const assignedTo = await this.pickMarketerForAssignment();
    return this.leadsRepo.save(
      this.leadsRepo.create({ ...dto, status: 'New', score, assignedTo, lastActivityAt: now }),
    );
  }

  async findLeads(filters: { status?: string; assignedTo?: string; stale?: boolean } = {}): Promise<LeadEntity[]> {
    const qb = this.leadsRepo.createQueryBuilder('lead').orderBy('lead.score', 'DESC').addOrderBy('lead.createdAt', 'DESC');
    if (filters.status) qb.andWhere('lead.status = :status', { status: filters.status });
    if (filters.assignedTo) qb.andWhere('lead.assignedTo = :assignedTo', { assignedTo: filters.assignedTo });
    if (filters.stale) {
      const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      qb.andWhere("lead.status IN ('New','Contacted')").andWhere(
        '(lead.lastActivityAt IS NULL OR lead.lastActivityAt < :cutoff)',
        { cutoff },
      );
    }
    return qb.getMany();
  }

  async reassignLead(id: string, assignedTo: string): Promise<LeadEntity> {
    await this.leadsRepo.update(id, { assignedTo });
    return this.leadsRepo.findOneOrFail({ where: { id } });
  }

  async touchLead(id: string): Promise<void> {
    await this.leadsRepo.update(id, { lastActivityAt: new Date() });
  }

  async updateLeadStatus(id: string, status: LeadEntity['status']): Promise<LeadEntity> {
    await this.leadsRepo.update(id, { status, lastActivityAt: new Date() });
    return this.leadsRepo.findOneOrFail({ where: { id } });
  }

  async convertLead(id: string, convertedClientId: string): Promise<LeadEntity> {
    await this.leadsRepo.update(id, { status: 'Converted', convertedClientId, lastActivityAt: new Date() });
    return this.leadsRepo.findOneOrFail({ where: { id } });
  }

  async createComplaint(dto: CreateComplaintDto): Promise<ComplaintEntity> {
    const client = await this.clientsRepo.findOneOrFail({ where: { id: dto.clientId } });
    const complaint = await this.complaintsRepo.save(
      this.complaintsRepo.create({ client, channel: dto.channel, issue: dto.issue, status: 'Open' }),
    );
    this.eventEmitter.emit(DomainEvents.ComplaintLogged, { complaintId: complaint.id });
    return complaint;
  }

  async findComplaints(status?: string): Promise<ComplaintEntity[]> {
    return this.complaintsRepo.find({
      where: status ? { status: status as ComplaintEntity['status'] } : {},
      order: { createdAt: 'DESC' },
    });
  }

  async resolveComplaint(id: string): Promise<ComplaintEntity> {
    await this.complaintsRepo.update(id, { status: 'Resolved' });
    return this.complaintsRepo.findOneOrFail({ where: { id } });
  }

  async logInteraction(dto: LogInteractionDto): Promise<CrmInteractionEntity> {
    const client = await this.clientsRepo.findOneOrFail({ where: { id: dto.clientId } });
    return this.interactionsRepo.save(
      this.interactionsRepo.create({ client, channel: dto.channel, summary: dto.summary }),
    );
  }

  async findInteractions(clientId: string): Promise<CrmInteractionEntity[]> {
    return this.interactionsRepo.find({
      where: { client: { id: clientId } },
      order: { createdAt: 'DESC' },
    });
  }
}
