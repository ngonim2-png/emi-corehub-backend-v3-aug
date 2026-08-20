import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { v4 as uuid } from 'uuid';
import { JournalEntryEntity, JournalLineEntity } from './entities/journal-entry.entity';
import { ChartOfAccountEntity } from './entities/chart-of-account.entity';
import { AccountingPeriodEntity } from './entities/accounting-period.entity';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { DomainEvents } from '../../common/events/domain-events';

export interface JournalLineInput {
  accountCode: string;
  debit: number;
  credit: number;
}

@Injectable()
export class JournalService {
  constructor(
    @InjectRepository(JournalEntryEntity)
    private readonly journalRepo: Repository<JournalEntryEntity>,
    @InjectRepository(ChartOfAccountEntity)
    private readonly accountsRepo: Repository<ChartOfAccountEntity>,
    @InjectRepository(AccountingPeriodEntity)
    private readonly periodsRepo: Repository<AccountingPeriodEntity>,
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async assertPeriodOpen(date: string): Promise<void> {
    const period = date.slice(0, 7);
    const closed = await this.periodsRepo.findOne({ where: { period } });
    if (closed) {
      throw new ForbiddenException(
        `${period} is closed for posting (closed ${closed.closedAt.toISOString().slice(0, 10)}) - this entry cannot be dated inside a closed period.`,
      );
    }
  }

  /**
   * The only path into journal_entries. Validates that debits equal
   * credits before touching the database - an out-of-balance entry is
   * rejected outright rather than posted and flagged later. Also the
   * single point where the period-lock check applies, so nothing (manual
   * entry, reversal, or an automatic post from a payment/claim event)
   * can land in a closed month.
   */
  async post(
    date: string,
    narration: string,
    lines: JournalLineInput[],
    sourceModule: string,
    sourceRef: string | null,
    actor: AuthenticatedUser | null,
  ): Promise<JournalEntryEntity> {
    await this.assertPeriodOpen(date);

    const totalDebit = lines.reduce((sum, l) => sum + l.debit, 0);
    const totalCredit = lines.reduce((sum, l) => sum + l.credit, 0);
    if (Math.abs(totalDebit - totalCredit) > 0.001) {
      throw new BadRequestException(
        `Journal entry does not balance: debits ${totalDebit} vs credits ${totalCredit}`,
      );
    }

    const entryNo = `JV-${uuid().slice(0, 8).toUpperCase()}`;
    // Manually-keyed entries need a second person's sign-off before they
    // affect the books; entries auto-posted from an already-validated
    // business event (a payment, a claim) don't - there's no data-entry
    // error for a second person to catch on those.
    const status = sourceModule === 'manual' ? 'Pending Approval' : 'Posted';

    return this.dataSource.transaction(async (manager) => {
      const accounts = await manager.find(ChartOfAccountEntity, {
        where: lines.map((l) => ({ code: l.accountCode })),
      });
      const accountByCode = new Map(accounts.map((a) => [a.code, a]));

      const entry = manager.create(JournalEntryEntity, {
        entryNo,
        date,
        narration,
        sourceModule,
        sourceRef,
        postedBy: actor?.id ?? null,
        status,
        lines: lines.map((l) => {
          const account = accountByCode.get(l.accountCode);
          if (!account) {
            throw new BadRequestException(`Unknown chart of accounts code: ${l.accountCode}`);
          }
          return manager.create(JournalLineEntity, {
            account,
            debit: l.debit.toFixed(2),
            credit: l.credit.toFixed(2),
          });
        }),
      });
      const saved = await manager.save(JournalEntryEntity, entry);

      if (actor) {
        await this.auditService.recordInTransaction(manager, {
          userId: actor.id,
          action: 'journal.posted',
          entityType: 'journal_entry',
          entityId: saved.id,
          before: null,
          after: { entryNo, narration, lines, status },
        });
      }

      this.eventEmitter.emit(DomainEvents.JournalPosted, { journalEntryId: saved.id });
      return saved;
    });
  }

  /** Maker-checker: a second person approves a manually-keyed entry before it's real. */
  async approve(id: string, actor: AuthenticatedUser): Promise<JournalEntryEntity> {
    const entry = await this.journalRepo.findOneOrFail({ where: { id } });
    if (entry.status !== 'Pending Approval') {
      throw new BadRequestException('Only entries pending approval can be approved.');
    }
    if (entry.postedBy === actor.id) {
      throw new ForbiddenException('You cannot approve your own journal entry - a second person must sign off.');
    }
    entry.status = 'Posted';
    entry.approvedBy = actor.id;
    await this.journalRepo.save(entry);
    await this.auditService.record({
      userId: actor.id, action: 'journal.approved', entityType: 'journal_entry', entityId: id,
      before: { status: 'Pending Approval' }, after: { status: 'Posted' },
    });
    return entry;
  }

  /** Journal entries can't be edited or deleted, only reversed with a new offsetting entry - the original stays in the record. */
  async reverse(id: string, narration: string, actor: AuthenticatedUser): Promise<JournalEntryEntity> {
    const original = await this.journalRepo.findOne({ where: { id }, relations: ['lines', 'lines.account'] });
    if (!original) throw new BadRequestException('Journal entry not found.');
    if (original.status !== 'Posted') throw new BadRequestException('Only posted entries can be reversed.');
    if (original.reversalStatus === 'Reversed') throw new BadRequestException('This entry has already been reversed.');

    const reversalLines: JournalLineInput[] = original.lines.map((l) => ({
      accountCode: l.account.code,
      debit: Number(l.credit),
      credit: Number(l.debit),
    }));
    const today = new Date().toISOString().slice(0, 10);
    const reversal = await this.post(
      today,
      narration || `Reversal of ${original.entryNo}: ${original.narration}`,
      reversalLines,
      'reversal',
      original.id,
      actor,
    );
    reversal.reversalOfEntryId = original.id;
    await this.journalRepo.save(reversal);

    original.reversalStatus = 'Reversed';
    await this.journalRepo.save(original);
    return reversal;
  }

  async closePeriod(period: string, actor: AuthenticatedUser, notes?: string): Promise<AccountingPeriodEntity> {
    const existing = await this.periodsRepo.findOne({ where: { period } });
    if (existing) throw new BadRequestException(`${period} is already closed.`);

    const pendingInPeriod = await this.journalRepo
      .createQueryBuilder('entry')
      .where('entry.status = :status', { status: 'Pending Approval' })
      .andWhere("to_char(entry.date, 'YYYY-MM') = :period", { period })
      .getCount();
    if (pendingInPeriod > 0) {
      throw new BadRequestException(
        `${pendingInPeriod} journal entr${pendingInPeriod === 1 ? 'y is' : 'ies are'} still pending approval in ${period} - resolve those before closing.`,
      );
    }

    const closed = await this.periodsRepo.save(
      this.periodsRepo.create({ period, status: 'Closed', closedBy: actor.id, notes }),
    );
    await this.auditService.record({
      userId: actor.id, action: 'period.closed', entityType: 'accounting_period', entityId: closed.id,
      before: null, after: { period, notes },
    });
    return closed;
  }

  async findClosedPeriods(month?: string): Promise<AccountingPeriodEntity[]> {
    return this.periodsRepo.find({ where: month ? { period: month } : {}, order: { period: 'DESC' } });
  }

  /**
   * For backfilling months from before the system was in use - reuses
   * the exact same post() validation (balance check, period-lock,
   * audit trail) every other entry goes through, just with a distinct
   * sourceModule so these land as 'Posted' directly rather than
   * 'Pending Approval'. That's a deliberate choice, not a shortcut:
   * the review here happens once, on the whole file, by the person
   * uploading it (who must already hold approval authority - see the
   * controller) - not per-row through the UI, which would make
   * backfilling months of real history impractical.
   */
  async bulkUploadHistoricalEntries(
    rows: { date: string; narration: string; debitAccountCode: string; creditAccountCode: string; amount: number }[],
    actor: AuthenticatedUser,
  ): Promise<{ created: number; failed: { row: number; reason: string }[] }> {
    let created = 0;
    const failed: { row: number; reason: string }[] = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        await this.post(
          row.date, row.narration,
          [
            { accountCode: row.debitAccountCode, debit: row.amount, credit: 0 },
            { accountCode: row.creditAccountCode, debit: 0, credit: row.amount },
          ],
          'bulk-historical-upload', null, actor,
        );
        created++;
      } catch (error) {
        failed.push({ row: i + 2, reason: (error as Error).message }); // +2: header row + 1-indexing
      }
    }
    return { created, failed };
  }
  async findRecent(limit = 100, from?: string, to?: string): Promise<JournalEntryEntity[]> {
    const qb = this.journalRepo
      .createQueryBuilder('entry')
      .leftJoinAndSelect('entry.lines', 'lines')
      .leftJoinAndSelect('lines.account', 'account')
      .orderBy('entry.createdAt', 'DESC')
      .take(limit);
    if (from) qb.andWhere('entry.date >= :from', { from });
    if (to) qb.andWhere('entry.date <= :to', { to });
    return qb.getMany();
  }

  async trialBalance(from?: string, to?: string): Promise<{ code: string; name: string; debit: number; credit: number }[]> {
    const qb = this.journalRepo.manager
      .createQueryBuilder(JournalLineEntity, 'line')
      .innerJoin('line.account', 'account')
      .innerJoin('line.journalEntry', 'entry')
      .select('account.code', 'code')
      .addSelect('account.name', 'name')
      .addSelect('COALESCE(SUM(line.debit), 0)', 'debit')
      .addSelect('COALESCE(SUM(line.credit), 0)', 'credit')
      .where('entry.status = :status', { status: 'Posted' })
      .groupBy('account.code')
      .addGroupBy('account.name')
      .orderBy('account.code');
    if (from) qb.andWhere('entry.date >= :from', { from });
    if (to) qb.andWhere('entry.date <= :to', { to });
    const rows = await qb.getRawMany();
    return rows.map((r) => ({ ...r, debit: Number(r.debit), credit: Number(r.credit) }));
  }

  /** Every journal line touching one account, for the "click an account in the trial balance" drill-down. */
  async accountLedger(accountCode: string, from?: string, to?: string) {
    const qb = this.journalRepo.manager
      .createQueryBuilder(JournalLineEntity, 'line')
      .innerJoin('line.account', 'account')
      .innerJoin('line.journalEntry', 'entry')
      .select('entry.date', 'date')
      .addSelect('entry.narration', 'narration')
      .addSelect('entry.entryNo', 'entryNo')
      .addSelect('entry.sourceModule', 'sourceModule')
      .addSelect('entry.id', 'entryId')
      .addSelect('line.debit', 'debit')
      .addSelect('line.credit', 'credit')
      .where('account.code = :accountCode', { accountCode })
      .andWhere('entry.status = :status', { status: 'Posted' })
      .orderBy('entry.date', 'ASC');
    if (from) qb.andWhere('entry.date >= :from', { from });
    if (to) qb.andWhere('entry.date <= :to', { to });
    const rows = await qb.getRawMany();
    let running = 0;
    return rows.map((r) => {
      running += Number(r.debit) - Number(r.credit);
      return { ...r, debit: Number(r.debit), credit: Number(r.credit), runningBalance: running };
    });
  }
}
