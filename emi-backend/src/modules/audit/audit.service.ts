import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { AuditLogEntity } from './audit-log.entity';
import { UserEntity } from '../identity-access/entities/user.entity';

export interface RecordAuditInput {
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  before: Record<string, any> | null;
  after: Record<string, any> | null;
  ip?: string | null;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectRepository(AuditLogEntity)
    private readonly auditRepo: Repository<AuditLogEntity>,
    @InjectRepository(UserEntity)
    private readonly usersRepo: Repository<UserEntity>,
  ) {}

  /**
   * Fire-and-forget path used by AuditLogInterceptor for routes where the
   * audit write does not need to be atomic with the business transaction.
   */
  async record(input: RecordAuditInput): Promise<void> {
    try {
      await this.auditRepo.insert({
        userId: input.userId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        before: input.before,
        after: input.after,
        ip: input.ip ?? null,
      });
    } catch (error) {
      // An audit write failure must never take down the request that
      // triggered it, but it must never be silent either - this is a
      // paging alert in production, not a console.error.
      this.logger.error('Failed to write audit log entry', error as Error);
    }
  }

  /**
   * Used inside a service's own transaction for approval-gated actions
   * (payment reversal, token allocation, journal posting, claim approval,
   * policy number edit, role change) where the audit row must succeed or
   * fail together with the mutation itself.
   */
  async recordInTransaction(manager: EntityManager, input: RecordAuditInput): Promise<void> {
    await manager.insert(AuditLogEntity, {
      userId: input.userId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      before: input.before,
      after: input.after,
      ip: input.ip ?? null,
    });
  }

  async findRecent(filters: {
    limit?: number;
    action?: string;
    entityType?: string;
    userId?: string;
    from?: string;
    to?: string;
  } = {}): Promise<AuditLogEntity[]> {
    const qb = this.auditRepo.createQueryBuilder('audit').orderBy('audit.ts', 'DESC');
    if (filters.action) qb.andWhere('audit.action ILIKE :action', { action: `%${filters.action}%` });
    if (filters.entityType) qb.andWhere('audit.entityType = :entityType', { entityType: filters.entityType });
    if (filters.userId) qb.andWhere('audit.userId = :userId', { userId: filters.userId });
    if (filters.from) qb.andWhere('audit.ts >= :from', { from: filters.from });
    if (filters.to) qb.andWhere('audit.ts <= :to', { to: filters.to });
    return qb.take(filters.limit ?? 200).getMany();
  }

  private csvEscape(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  /**
   * The "download of audit trail in readable format" requirement - CSV
   * opens directly in Excel/Sheets, with real user names instead of raw
   * IDs, and before/after diffs flattened to a single readable cell
   * each rather than raw nested JSON.
   */
  async exportCsv(filters: { action?: string; entityType?: string; userId?: string; from?: string; to?: string } = {}): Promise<string> {
    const logs = await this.findRecent({ ...filters, limit: 10000 });
    const userIds = [...new Set(logs.map((l) => l.userId).filter((id): id is string => !!id))];
    const users = userIds.length ? await this.usersRepo.find({ where: userIds.map((id) => ({ id })) }) : [];
    const userNames = new Map(users.map((u) => [u.id, u.fullName]));

    const header = ['Timestamp', 'User', 'Action', 'Entity Type', 'Entity ID', 'Before', 'After'];
    const rows = logs.map((l) => [
      l.ts.toISOString(),
      l.userId ? (userNames.get(l.userId) ?? l.userId) : 'System',
      l.action,
      l.entityType,
      l.entityId ?? '',
      l.before ? JSON.stringify(l.before) : '',
      l.after ? JSON.stringify(l.after) : '',
    ]);
    return [header, ...rows].map((row) => row.map((cell) => this.csvEscape(String(cell))).join(',')).join('\n');
  }
}
