import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { JournalService } from './journal.service';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { LoanDisbursedEvent, LoanRepaymentRecordedEvent } from '../../common/events/domain-events';

const CASH_ACCOUNT_BY_METHOD: Record<string, string> = {
  'Cash Office Payment': '1000',
  'Mobile Money': '1020',
  'Bank Transfer': '1010',
  'Payroll Deduction': '1010',
  'Direct Debit': '1010',
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Puts client loans in the books.
 *
 * Disbursement (flat interest is known up front):
 *   Dr Loans receivable       principal + interest
 *   Cr Bank                   principal
 *   Cr Unearned loan interest interest
 *
 * Each repayment:
 *   Dr Cash / Bank / Mobile money   amount
 *   Cr Loans receivable             amount
 *   Dr Unearned loan interest       interest share of the amount
 *   Cr Loan interest income         interest share of the amount
 *
 * The interest share is amount x total interest / total repayable, so by the
 * last installment all the interest has moved to income.
 */
@Injectable()
export class LoanJournalService {
  private readonly logger = new Logger(LoanJournalService.name);

  constructor(
    private readonly journalService: JournalService,
    private readonly config: ConfigService,
    private readonly dataSource: DataSource,
  ) {}

  private accounts() {
    const c = (k: string, d: string) => this.config.get<string>(`finance.${k}`) || d;
    return {
      receivable: c('loanReceivableAccount', '1400'),
      unearned: c('loanUnearnedInterestAccount', '2500'),
      income: c('loanInterestIncomeAccount', '4200'),
      payout: c('loanPayoutAccount', '1010'),
    };
  }

  private async assertAccounts(): Promise<ReturnType<LoanJournalService['accounts']>> {
    const a = this.accounts();
    const missing: string[] = [];
    for (const code of Object.values(a)) if (!(await this.journalService.accountExists(code))) missing.push(code);
    if (missing.length) throw new BadRequestException(`Add these accounts to the chart of accounts first: ${missing.join(', ')}.`);
    return a;
  }

  /** Today, or the given date if its month is still open. */
  private async postingDate(preferred: string | null, today: string): Promise<string> {
    if (!preferred) return today;
    try {
      await this.journalService.assertPeriodOpen(preferred);
      return preferred;
    } catch {
      return today;
    }
  }

  async postDisbursement(e: LoanDisbursedEvent, actor: AuthenticatedUser | null = null, note = '') {
    const a = await this.assertAccounts();
    const principal = r2(e.principal);
    const interest = r2(e.totalInterest);
    const lines = [
      { accountCode: a.receivable, debit: r2(principal + interest), credit: 0 },
      { accountCode: a.payout, debit: 0, credit: principal },
    ];
    if (interest > 0) lines.push({ accountCode: a.unearned, debit: 0, credit: interest });
    return this.journalService.post(e.date, `Loan ${e.loanRef} paid out - ${e.clientName}${note}`, lines, 'loans', e.loanId, actor);
  }

  async postRepayment(e: LoanRepaymentRecordedEvent, actor: AuthenticatedUser | null = null, note = '') {
    const a = await this.assertAccounts();
    const amount = r2(e.amount);
    const interest = Math.min(r2(e.interestPortion), amount);
    const cash = CASH_ACCOUNT_BY_METHOD[e.paymentMethod] ?? a.payout;
    const lines = [
      { accountCode: cash, debit: amount, credit: 0 },
      { accountCode: a.receivable, debit: 0, credit: amount },
    ];
    if (interest > 0) {
      lines.push({ accountCode: a.unearned, debit: interest, credit: 0 });
      lines.push({ accountCode: a.income, debit: 0, credit: interest });
    }
    return this.journalService.post(
      e.date,
      `Loan ${e.loanRef} repayment for ${e.dueMonth} - ${e.clientName}${note}`,
      lines,
      'loans',
      e.repaymentId,
      actor,
    );
  }

  private async missing() {
    const loans: any[] = await this.dataSource.query(`
      SELECT l.id, l."loanRef", l.principal, l."totalInterest", l."totalRepayable", l."disbursedAt", c."fullName"
      FROM loans l JOIN clients c ON c.id = l."clientId"
      WHERE l.status IN ('Disbursed', 'Completed')
        AND NOT EXISTS (SELECT 1 FROM journal_entries j WHERE j."sourceModule" = 'loans' AND j."sourceRef" = l.id)
      ORDER BY l."disbursedAt" NULLS LAST`);
    const repayments: any[] = await this.dataSource.query(`
      SELECT x.* FROM (
        SELECT r.id, r."dueMonth", r."amountPaid", r."paidAt", l.id AS "loanId", l."loanRef", l."totalInterest", l."totalRepayable", c."fullName",
               COALESCE(SUM(r."amountPaid") OVER (PARTITION BY l.id ORDER BY r."dueMonth" ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS "paidBefore"
        FROM loan_repayments r JOIN loans l ON l.id = r."loanId" JOIN clients c ON c.id = l."clientId"
      ) x
      WHERE x."amountPaid" > 0
        AND NOT EXISTS (SELECT 1 FROM journal_entries j WHERE j."sourceModule" = 'loans' AND j."sourceRef" = x.id)
      ORDER BY x."dueMonth"`);
    return { loans, repayments };
  }

  async status() {
    const { loans, repayments } = await this.missing();
    return {
      loansNotInBooks: loans.length,
      repaymentsNotInBooks: repayments.length,
      amountNotInBooks: r2(repayments.reduce((s, r) => s + Number(r.amountPaid), 0)),
      accounts: this.accounts(),
    };
  }

  /** Books loans and repayments recorded before loans reached the books (or whose posting failed). Safe to run more than once. */
  async backfill(actor: AuthenticatedUser) {
    await this.assertAccounts();
    const today = new Date().toISOString().slice(0, 10);
    const { loans, repayments } = await this.missing();
    let loansPosted = 0;
    let repaymentsPosted = 0;
    const errors: string[] = [];
    for (const l of loans) {
      const ref = l.loanRef ?? String(l.id).slice(0, 8);
      try {
        const d = l.disbursedAt ? new Date(l.disbursedAt).toISOString().slice(0, 10) : null;
        await this.postDisbursement(
          { loanId: l.id, loanRef: ref, clientName: l.fullName, principal: Number(l.principal), totalInterest: Number(l.totalInterest), totalRepayable: Number(l.totalRepayable), date: await this.postingDate(d, today) },
          actor,
          ' (catch-up)',
        );
        loansPosted++;
      } catch (e) {
        errors.push(`${ref}: ${(e as Error).message}`);
      }
    }
    for (const r of repayments) {
      const ref = r.loanRef ?? String(r.loanId).slice(0, 8);
      try {
        const total = Number(r.totalRepayable);
        const amount = Number(r.amountPaid);
        const d = r.paidAt ? new Date(r.paidAt).toISOString().slice(0, 10) : null;
        await this.postRepayment(
          {
            loanId: r.loanId, loanRef: ref, repaymentId: r.id, clientName: r.fullName, dueMonth: r.dueMonth, amount,
            // Same cumulative method as live repayments, so the interest adds up exactly.
            interestPortion: total > 0
              ? r2(r2(Number(r.totalInterest) * Math.min(1, (Number(r.paidBefore) + amount) / total)) - r2(Number(r.totalInterest) * Math.min(1, Number(r.paidBefore) / total)))
              : 0,
            paymentMethod: 'Bank Transfer', date: await this.postingDate(d, today),
          },
          actor,
          ' (catch-up)',
        );
        repaymentsPosted++;
      } catch (e) {
        errors.push(`${ref} ${r.dueMonth}: ${(e as Error).message}`);
      }
    }
    this.logger.log(`Loan backfill: ${loansPosted} loans, ${repaymentsPosted} repayments, ${errors.length} errors`);
    return { loansPosted, repaymentsPosted, errors };
  }
}
