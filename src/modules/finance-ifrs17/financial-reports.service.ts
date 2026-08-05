import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BankAccountEntity, BankStatementLineEntity } from './entities/bank-account.entity';
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

    const matchedLineIds = new Set(
      (await this.statementLinesRepo.find({ where: { bankAccount: { id: bankAccountId }, matched: true } })).map(
        (l) => l.matchedJournalLineId,
      ),
    );
    const unmatchedLedgerLines = allLedgerLines.filter((l) => !matchedLineIds.has(l.id));

    return {
      bankAccount: { id: bankAccount.id, name: bankAccount.name, accountNumber: bankAccount.accountNumber, glCode: bankAccount.glAccount.code },
      unmatchedStatementLines,
      unmatchedLedgerLines,
    };
  }

  async matchLines(statementLineId: string, journalLineId: string): Promise<void> {
    const line = await this.statementLinesRepo.findOneOrFail({ where: { id: statementLineId } });
    line.matched = true;
    line.matchedJournalLineId = journalLineId;
    await this.statementLinesRepo.save(line);
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
      // Income/liability/equity accounts run credit-normal, everything else debit-normal.
      const actual = account && ['Income', 'Liability'].includes(account.type) ? credit - debit : debit - credit;
      const budgeted = Number(budget.budgetedAmount);
      results.push({
        accountCode: budget.accountCode, accountName: account?.name ?? '', budgeted, actual,
        variance: actual - budgeted, variancePct: budgeted !== 0 ? ((actual - budgeted) / Math.abs(budgeted)) * 100 : null,
      });
    }
    return results;
  }

  // ---------- Cash flow (direct method, categorized by source module) ----------

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
