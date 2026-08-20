import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BankAccountEntity, BankStatementLineEntity } from './entities/bank-account.entity';
import { BankAccountDeletionRequestEntity } from './entities/bank-account-deletion-request.entity';
import { BudgetLineEntity } from './entities/budget-line.entity';
import { JournalLineEntity } from './entities/journal-entry.entity';
import { ChartOfAccountEntity } from './entities/chart-of-account.entity';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

@Injectable()
export class FinancialReportsService {
  constructor(
    @InjectRepository(BankAccountEntity) private readonly bankAccountsRepo: Repository<BankAccountEntity>,
    @InjectRepository(BankStatementLineEntity)
    private readonly statementLinesRepo: Repository<BankStatementLineEntity>,
    @InjectRepository(BankAccountDeletionRequestEntity)
    private readonly deletionRequestsRepo: Repository<BankAccountDeletionRequestEntity>,
    @InjectRepository(BudgetLineEntity) private readonly budgetRepo: Repository<BudgetLineEntity>,
    @InjectRepository(JournalLineEntity) private readonly journalLinesRepo: Repository<JournalLineEntity>,
    @InjectRepository(ChartOfAccountEntity) private readonly accountsRepo: Repository<ChartOfAccountEntity>,
  ) {}

  // ---------- Bank reconciliation ----------

  async createBankAccount(name: string, accountNumber: string, glAccountCode: string): Promise<BankAccountEntity> {
    const glAccount = await this.accountsRepo.findOneOrFail({ where: { code: glAccountCode } });
    return this.bankAccountsRepo.save(this.bankAccountsRepo.create({ name, accountNumber, glAccount }));
  }

  async findBankAccounts(): Promise<BankAccountEntity[]> {
    return this.bankAccountsRepo.find({ relations: ['glAccount'] });
  }

  /** Bulk-imports statement lines (e.g. from a bank CSV export) - each line starts unmatched. */
  async importStatementLines(
    bankAccountId: string,
    lines: { date: string; description: string; amount: number }[],
  ): Promise<BankStatementLineEntity[]> {
    const bankAccount = await this.bankAccountsRepo.findOneOrFail({ where: { id: bankAccountId } });
    const entities = lines.map((l) =>
      this.statementLinesRepo.create({
        bankAccount, date: l.date, description: l.description, amount: l.amount.toFixed(2), matched: false,
      }),
    );
    return this.statementLinesRepo.save(entities);
  }

  /**
   * The reconciliation view: unmatched statement lines on one side,
   * unmatched ledger lines on the GL account this bank account
   * represents on the other. Nothing here auto-matches by amount/date -
   * that's a judgment call a human makes by clicking match, since two
   * unrelated transactions can coincidentally share an amount.
   */
  async reconciliationView(bankAccountId: string) {
    const bankAccount = await this.bankAccountsRepo.findOneOrFail({
      where: { id: bankAccountId }, relations: ['glAccount'],
    });
    const unmatchedStatementLines = await this.statementLinesRepo.find({
      where: { bankAccount: { id: bankAccountId }, matched: false },
      order: { date: 'ASC' },
    });
    const allLedgerLines = await this.journalLinesRepo
      .createQueryBuilder('line')
      .innerJoin('line.journalEntry', 'entry')
      .innerJoin('line.account', 'account')
      .select(['line.id', 'line.debit', 'line.credit', 'entry.date', 'entry.narration', 'entry.entryNo'])
      .where('account.id = :accountId', { accountId: bankAccount.glAccount.id })
      .andWhere('entry.status = :status', { status: 'Posted' })
      .getMany();

    const matchedStatementLines = await this.statementLinesRepo.find({
      where: { bankAccount: { id: bankAccountId }, matched: true },
      order: { date: 'DESC' },
    });
    const matchedLineIds = new Set(matchedStatementLines.map((l) => l.matchedJournalLineId));
    const unmatchedLedgerLines = allLedgerLines.filter((l) => !matchedLineIds.has(l.id));

    return {
      bankAccount: { id: bankAccount.id, name: bankAccount.name, accountNumber: bankAccount.accountNumber, glCode: bankAccount.glAccount.code },
      unmatchedStatementLines,
      unmatchedLedgerLines,
      matchedStatementLines,
    };
  }

  async matchLines(statementLineId: string, journalLineId: string): Promise<void> {
    const line = await this.statementLinesRepo.findOneOrFail({ where: { id: statementLineId } });
    line.matched = true;
    line.matchedJournalLineId = journalLineId;
    await this.statementLinesRepo.save(line);
  }

  /** Undoes a match made in error - the statement line goes back to unmatched, available to match against a different (correct) ledger line. */
  async unmatchLine(statementLineId: string): Promise<void> {
    const line = await this.statementLinesRepo.findOneOrFail({ where: { id: statementLineId } });
    line.matched = false;
    line.matchedJournalLineId = null;
    await this.statementLinesRepo.save(line);
  }

  /** Editing a bank account's own details (name, account number) - not its linked GL account, which is a more structural change nothing here currently needs to support. */
  async editBankAccount(id: string, updates: { name?: string; accountNumber?: string }): Promise<BankAccountEntity> {
    const account = await this.bankAccountsRepo.findOneOrFail({ where: { id }, relations: ['glAccount'] });
    if (updates.name !== undefined) account.name = updates.name;
    if (updates.accountNumber !== undefined) account.accountNumber = updates.accountNumber;
    return this.bankAccountsRepo.save(account);
  }

  /**
   * Supreme Admin requesting deletion executes immediately - there's no
   * one else to check their own request against, so a Supreme Admin
   * waiting on themselves would be friction without a real safeguard
   * behind it. Anyone else (Finance Manager) creates a Pending request
   * that only a Supreme Admin can later approve or reject - see
   * decideBankAccountDeletion.
   */
  async requestBankAccountDeletion(
    bankAccountId: string,
    actor: AuthenticatedUser,
    reason?: string,
  ): Promise<{ deleted: boolean; request: BankAccountDeletionRequestEntity | null }> {
    const account = await this.bankAccountsRepo.findOneOrFail({ where: { id: bankAccountId } });

    if (actor.role === 'Supreme Admin') {
      await this.bankAccountsRepo.delete(bankAccountId);
      return { deleted: true, request: null };
    }

    const existingPending = await this.deletionRequestsRepo.findOne({
      where: { bankAccount: { id: bankAccountId }, status: 'Pending' },
    });
    if (existingPending) {
      throw new ForbiddenException('A deletion request for this bank account is already pending Supreme Admin approval.');
    }

    const request = await this.deletionRequestsRepo.save(
      this.deletionRequestsRepo.create({
        bankAccount: account, bankAccountName: account.name, reason: reason ?? null,
        status: 'Pending', requestedBy: actor.id,
      }),
    );
    return { deleted: false, request };
  }

  async listDeletionRequests(status?: string): Promise<BankAccountDeletionRequestEntity[]> {
    return this.deletionRequestsRepo.find({
      where: status ? { status: status as any } : {},
      relations: ['bankAccount'],
      order: { requestedAt: 'DESC' },
    });
  }

  /** Supreme-Admin-only in the controller - approving actually deletes the bank account; rejecting just closes out the request, leaving the account untouched. */
  async decideBankAccountDeletion(
    requestId: string,
    decision: 'Approved' | 'Rejected',
    actor: AuthenticatedUser,
  ): Promise<BankAccountDeletionRequestEntity> {
    const request = await this.deletionRequestsRepo.findOne({ where: { id: requestId }, relations: ['bankAccount'] });
    if (!request) throw new NotFoundException('Deletion request not found');
    if (request.status !== 'Pending') throw new ForbiddenException('This request has already been decided.');

    if (decision === 'Approved' && request.bankAccount) {
      await this.bankAccountsRepo.delete(request.bankAccount.id);
      request.bankAccount = null;
    }
    request.status = decision;
    request.decidedBy = actor.id;
    request.decidedAt = new Date();
    return this.deletionRequestsRepo.save(request);
  }

  // ---------- Budget vs actual ----------

  async setBudgetLine(accountCode: string, year: string, budgetedAmount: number, actor: AuthenticatedUser): Promise<BudgetLineEntity> {
    const existing = await this.budgetRepo.findOne({ where: { accountCode, year } });
    if (existing) {
      existing.budgetedAmount = budgetedAmount.toFixed(2);
      existing.setBy = actor.id;
      return this.budgetRepo.save(existing);
    }
    return this.budgetRepo.save(
      this.budgetRepo.create({ accountCode, year, budgetedAmount: budgetedAmount.toFixed(2), setBy: actor.id }),
    );
  }

  async budgetVsActual(year: string) {
    const budgets = await this.budgetRepo.find({ where: { year } });
    const results = [];
    for (const budget of budgets) {
      const account = await this.accountsRepo.findOne({ where: { code: budget.accountCode } });
      const rows = await this.journalLinesRepo
        .createQueryBuilder('line')
        .innerJoin('line.journalEntry', 'entry')
        .innerJoin('line.account', 'account')
        .select('COALESCE(SUM(line.debit), 0)', 'debit')
        .addSelect('COALESCE(SUM(line.credit), 0)', 'credit')
        .where('account.code = :code', { code: budget.accountCode })
        .andWhere('entry.status = :status', { status: 'Posted' })
        .andWhere("to_char(entry.date, 'YYYY') = :year", { year })
        .getRawOne<{ debit: string; credit: string }>();
      const debit = Number(rows?.debit ?? 0);
      const credit = Number(rows?.credit ?? 0);
      // Income, Liability, and Equity accounts run credit-normal, everything else debit-normal.
      const actual = account && ['Income', 'Liability', 'Equity'].includes(account.type) ? credit - debit : debit - credit;
      const budgeted = Number(budget.budgetedAmount);
      results.push({
        accountCode: budget.accountCode, accountName: account?.name ?? '', budgeted, actual,
        variance: actual - budgeted, variancePct: budgeted !== 0 ? ((actual - budgeted) / Math.abs(budgeted)) * 100 : null,
      });
    }
    return results;
  }

  // ---------- Financial statements (detailed, account-level) ----------

  /**
   * Every account's actual figure within its statement section, not
   * just a type-level total - the previous version only showed 3
   * summary lines per statement, which doesn't tell anyone which
   * accounts are actually driving the number. Income, Liability, and
   * Equity accounts are credit-normal; Asset and Expense are
   * debit-normal - the same correct three-type set used consistently
   * here and in budgetVsActual (that method previously omitted Equity,
   * which inverted the sign for any Equity account - fixed alongside
   * this).
   */
  async financialStatement(from?: string, to?: string) {
    const [balances, accounts] = await Promise.all([
      this.journalLinesRepo.manager
        .createQueryBuilder(JournalLineEntity, 'line')
        .innerJoin('line.account', 'account')
        .innerJoin('line.journalEntry', 'entry')
        .select('account.code', 'code')
        .addSelect('COALESCE(SUM(line.debit), 0)', 'debit')
        .addSelect('COALESCE(SUM(line.credit), 0)', 'credit')
        .where('entry.status = :status', { status: 'Posted' })
        .andWhere(from ? 'entry.date >= :from' : '1=1', from ? { from } : {})
        .andWhere(to ? 'entry.date <= :to' : '1=1', to ? { to } : {})
        .groupBy('account.code')
        .getRawMany<{ code: string; debit: string; credit: string }>(),
      this.accountsRepo.find({ order: { code: 'ASC' } }),
    ]);
    const byCode = new Map(balances.map((b) => [b.code, { debit: Number(b.debit), credit: Number(b.credit) }]));
    const creditNormal = new Set(['Income', 'Liability', 'Equity']);

    const line = (a: ChartOfAccountEntity) => {
      const bal = byCode.get(a.code) ?? { debit: 0, credit: 0 };
      const amount = creditNormal.has(a.type) ? bal.credit - bal.debit : bal.debit - bal.credit;
      return { code: a.code, name: a.name, amount };
    };

    const byType = (type: string) => accounts.filter((a) => a.type === type).map(line).filter((l) => l.amount !== 0);
    const sum = (lines: { amount: number }[]) => lines.reduce((s, l) => s + l.amount, 0);

    const income = byType('Income');
    const expense = byType('Expense');
    const assets = byType('Asset');
    const liabilities = byType('Liability');
    const equity = byType('Equity');
    const incomeTotal = sum(income);
    const expenseTotal = sum(expense);
    const assetsTotal = sum(assets);
    const liabilitiesTotal = sum(liabilities);
    const equityTotal = sum(equity);

    return {
      period: { from: from ?? null, to: to ?? null },
      profitOrLoss: { income, expense, incomeTotal, expenseTotal, netResult: incomeTotal - expenseTotal },
      financialPosition: {
        assets, liabilities, equity, assetsTotal, liabilitiesTotal, equityTotal,
        netAssets: assetsTotal - liabilitiesTotal,
      },
    };
  }

  // ---------- Chart of accounts bulk import ----------

  /**
   * Merges rows into the chart of accounts - built to be safe for any
   * future upload, not just the one it was built for. An existing
   * code is never overwritten by an upload; if a row's code already
   * exists, it's reported back as skipped rather than silently
   * replacing whatever that code currently means (which could be a
   * real account already referenced by real journal entries). Only
   * genuinely new codes get created.
   */
  async bulkImportAccounts(
    rows: { code: string; name: string; type: string; description?: string }[],
  ): Promise<{ created: number; skippedExisting: string[]; invalid: string[] }> {
    const validTypes = ['Asset', 'Liability', 'Equity', 'Income', 'Expense'];
    const existingCodes = new Set((await this.accountsRepo.find({ select: ['code'] })).map((a) => a.code));
    let created = 0;
    const skippedExisting: string[] = [];
    const invalid: string[] = [];

    for (const row of rows) {
      const code = String(row.code).trim();
      const name = String(row.name).trim();
      const type = String(row.type).trim();
      if (!code || !name || !validTypes.includes(type)) {
        invalid.push(`${code || '(no code)'} ${name || '(no name)'} - type must be one of ${validTypes.join('/')}`);
        continue;
      }
      if (existingCodes.has(code)) {
        skippedExisting.push(`${code} ${name}`);
        continue;
      }
      await this.accountsRepo.save(
        this.accountsRepo.create({ code, name, type: type as any, description: row.description?.trim() || null }),
      );
      existingCodes.add(code);
      created++;
    }
    return { created, skippedExisting, invalid };
  }

  async cashFlowStatement(from: string, to: string, cashAccountCode = '1000') {
    const rows = await this.journalLinesRepo
      .createQueryBuilder('line')
      .innerJoin('line.journalEntry', 'entry')
      .innerJoin('line.account', 'account')
      .select('entry.sourceModule', 'sourceModule')
      .addSelect('COALESCE(SUM(line.debit), 0)', 'inflow')
      .addSelect('COALESCE(SUM(line.credit), 0)', 'outflow')
      .where('account.code = :code', { code: cashAccountCode })
      .andWhere('entry.status = :status', { status: 'Posted' })
      .andWhere('entry.date >= :from', { from })
      .andWhere('entry.date <= :to', { to })
      .groupBy('entry.sourceModule')
      .getRawMany();

    const categorized = rows.map((r) => ({
      sourceModule: r.sourceModule,
      label: this.labelForSourceModule(r.sourceModule),
      inflow: Number(r.inflow),
      outflow: Number(r.outflow),
      net: Number(r.inflow) - Number(r.outflow),
    }));
    const netCashFlow = categorized.reduce((sum, c) => sum + c.net, 0);
    return { from, to, categories: categorized, netCashFlow };
  }

  private labelForSourceModule(sourceModule: string): string {
    const labels: Record<string, string> = {
      'field-collection-wallet': 'Premium collections',
      claims: 'Claims paid',
      administration: 'Administrative expenses',
      manual: 'Other manual entries',
      reversal: 'Reversals/adjustments',
    };
    return labels[sourceModule] ?? sourceModule;
  }
}
