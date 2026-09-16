import { Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuditLog } from '../../common/decorators/audit-log.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { FinancialReportsService } from './financial-reports.service';
import { buildExcelExport } from '../../common/utils/excel-export.util';
import { sendExcelFile } from '../../common/utils/send-excel-file.util';

@Controller('finance/bank-accounts')
export class BankReconciliationController {
  constructor(private readonly financialReportsService: FinancialReportsService) {}

  @Post()
  @Roles('Super Admin', 'Finance Manager')
  async create(
    @Body('name') name: string,
    @Body('accountNumber') accountNumber: string,
    @Body('glAccountCode') glAccountCode: string,
  ) {
    return this.financialReportsService.createBankAccount(name, accountNumber, glAccountCode);
  }

  @Get()
  async findAll() {
    return this.financialReportsService.findBankAccounts();
  }

  @Post(':id/statement-lines')
  @Roles('Super Admin', 'Finance Manager')
  async importLines(
    @Param('id') id: string,
    @Body('lines') lines: { date: string; description: string; amount: number }[],
  ) {
    return this.financialReportsService.importStatementLines(id, lines || []);
  }

  @Get(':id/reconciliation')
  async reconciliation(@Param('id') id: string) {
    return this.financialReportsService.reconciliationView(id);
  }

  /**
   * "Adjust" and "delete" are deliberately restricted to Finance
   * Manager only here (Supreme Admin bypasses automatically) - a
   * narrower set than the plain Super Admin + Finance Manager used on
   * the routes above, matching the specific instruction these two
   * actions needed tighter control than everyday bank-rec work.
   */
  @Post(':id/edit')
  @Roles('Finance Manager')
  @AuditLog({ action: 'bank_account.edited', entityType: 'bank_account' })
  async editBankAccount(
    @Param('id') id: string,
    @Body('name') name: string | undefined,
    @Body('accountNumber') accountNumber: string | undefined,
  ) {
    return this.financialReportsService.editBankAccount(id, { name, accountNumber });
  }

  @Post('statement-lines/:lineId/unmatch')
  @Roles('Finance Manager')
  @AuditLog({ action: 'bank_reconciliation.unmatched', entityType: 'bank_statement_line' })
  async unmatchLine(@Param('lineId') lineId: string) {
    await this.financialReportsService.unmatchLine(lineId);
    return { unmatched: true };
  }

  @Post(':id/request-deletion')
  @Roles('Finance Manager')
  @AuditLog({ action: 'bank_account.deletion_requested', entityType: 'bank_account' })
  async requestDeletion(
    @Param('id') id: string,
    @Body('reason') reason: string | undefined,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.financialReportsService.requestBankAccountDeletion(id, actor, reason);
  }

  @Get('deletion-requests')
  @Roles('Finance Manager')
  async listDeletionRequests(@Query('status') status?: string) {
    return this.financialReportsService.listDeletionRequests(status);
  }

  @Post('deletion-requests/:requestId/decide')
  @Roles('Supreme Admin')
  @AuditLog({ action: 'bank_account.deletion_decided', entityType: 'bank_account_deletion_request' })
  async decideDeletion(
    @Param('requestId') requestId: string,
    @Body('decision') decision: 'Approved' | 'Rejected',
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.financialReportsService.decideBankAccountDeletion(requestId, decision, actor);
  }

  @Get(':id/reconciliation/export')
  @Roles('Super Admin', 'Finance Manager')
  async exportReconciliation(@Param('id') id: string, @Res() res: Response) {
    const view = await this.financialReportsService.reconciliationView(id);
    const rows: Record<string, string | number | null>[] = [];
    for (const l of view.unmatchedStatementLines) {
      rows.push({ side: 'Bank statement', date: l.date, description: l.description, amount: Number(l.amount) });
    }
    for (const l of view.unmatchedLedgerLines as any[]) {
      rows.push({ side: 'General ledger', date: l.date ?? '', description: l.narration ?? '', amount: Number(l.debit) || -Number(l.credit) });
    }
    const buffer = await buildExcelExport(
      'Bank Reconciliation',
      [
        { header: 'Side', key: 'side', width: 16 },
        { header: 'Date', key: 'date', width: 12 },
        { header: 'Description', key: 'description', width: 34 },
        { header: 'Amount', key: 'amount', width: 16, numeric: true },
      ],
      rows,
      `Unmatched Items — ${view.bankAccount.name}`,
    );
    sendExcelFile(res, buffer, `bank-reconciliation-${view.bankAccount.name.replace(/\s+/g, '-')}.xlsx`);
  }

  @Post(':id/match')
  @Roles('Super Admin', 'Finance Manager')
  async match(
    @Param('id') id: string,
    @Body('statementLineId') statementLineId: string,
    @Body('journalLineId') journalLineId: string,
  ) {
    void id; // bankAccountId isn't needed beyond routing/scoping the UI call
    await this.financialReportsService.matchLines(statementLineId, journalLineId);
    return { matched: true };
  }
}

@Controller('finance/budgets')
export class BudgetController {
  constructor(private readonly financialReportsService: FinancialReportsService) {}

  @Post()
  @Roles('Super Admin', 'Finance Manager')
  async setBudget(
    @Body('accountCode') accountCode: string,
    @Body('year') year: string,
    @Body('budgetedAmount') budgetedAmount: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.financialReportsService.setBudgetLine(accountCode, year, budgetedAmount, user);
  }

  @Get('vs-actual')
  async budgetVsActual(@Query('year') year: string) {
    return this.financialReportsService.budgetVsActual(year);
  }

  @Get('vs-actual/export')
  @Roles('Super Admin', 'Finance Manager')
  async exportBudgetVsActual(@Query('year') year: string, @Res() res: Response) {
    const rows = await this.financialReportsService.budgetVsActual(year);
    const buffer = await buildExcelExport(
      'Budget vs Actual',
      [
        { header: 'Account code', key: 'accountCode', width: 12 },
        { header: 'Account name', key: 'accountName', width: 28 },
        { header: 'Budgeted', key: 'budgeted', width: 16, numeric: true },
        { header: 'Actual', key: 'actual', width: 16, numeric: true },
        { header: 'Variance', key: 'variance', width: 16, numeric: true },
        { header: 'Variance %', key: 'variancePct', width: 14, numeric: true },
      ],
      rows.map((r) => ({ ...r, variancePct: r.variancePct !== null ? Number(r.variancePct.toFixed(1)) : null })),
      `Budget vs Actual — ${year}`,
    );
    sendExcelFile(res, buffer, `budget-vs-actual-${year}.xlsx`);
  }
}

@Controller('reports')
export class CashFlowController {
  constructor(private readonly financialReportsService: FinancialReportsService) {}

  @Get('cash-flow')
  async cashFlow(@Query('from') from: string, @Query('to') to: string, @Query('cashAccountCode') cashAccountCode?: string) {
    return this.financialReportsService.cashFlowStatement(from, to, cashAccountCode);
  }

  @Get('cash-flow/export')
  @Roles('Super Admin', 'Finance Manager')
  async exportCashFlow(
    @Query('from') from: string, @Query('to') to: string, @Query('cashAccountCode') cashAccountCode: string | undefined,
    @Res() res: Response,
  ) {
    const result = await this.financialReportsService.cashFlowStatement(from, to, cashAccountCode);
    const rows: Record<string, string | number | null>[] = result.categories.map((c) => ({
      label: c.label, inflow: c.inflow, outflow: c.outflow, net: c.net,
    }));
    rows.push({ label: 'Net cash flow', inflow: null, outflow: null, net: result.netCashFlow });
    const buffer = await buildExcelExport(
      'Cash Flow',
      [
        { header: 'Category', key: 'label', width: 26 },
        { header: 'Inflow', key: 'inflow', width: 16, numeric: true },
        { header: 'Outflow', key: 'outflow', width: 16, numeric: true },
        { header: 'Net', key: 'net', width: 16, numeric: true },
      ],
      rows,
      `Cash Flow Statement — ${from} to ${to}`,
    );
    sendExcelFile(res, buffer, `cash-flow-${from}-to-${to}.xlsx`);
  }

  @Get('financial-statement')
  async financialStatement(@Query('from') from?: string, @Query('to') to?: string) {
    return this.financialReportsService.financialStatement(from, to);
  }

  @Get('financial-statement/account-detail')
  async accountDetail(@Query('code') code: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.financialReportsService.accountDetail(code, from, to);
  }

  @Get('financial-statement/export')
  @Roles('Super Admin', 'Finance Manager')
  async exportFinancialStatement(@Query('from') from: string, @Query('to') to: string, @Res() res: Response) {
    const statement = await this.financialReportsService.financialStatement(from, to);
    const rows: Record<string, string | number | null>[] = [];
    const addSection = (section: string, lines: { code: string; name: string; amount: number }[], total: number) => {
      for (const l of lines) rows.push({ section, code: l.code, name: l.name, amount: l.amount });
      rows.push({ section, code: '', name: `Total ${section}`, amount: total });
      rows.push({ section: '', code: '', name: '', amount: null });
    };
    addSection('Income', statement.profitOrLoss.income, statement.profitOrLoss.incomeTotal);
    addSection('Expense', statement.profitOrLoss.expense, statement.profitOrLoss.expenseTotal);
    rows.push({ section: '', code: '', name: 'Net insurance service result', amount: statement.profitOrLoss.netResult });
    rows.push({ section: '', code: '', name: '', amount: null });
    addSection('Assets', statement.financialPosition.assets, statement.financialPosition.assetsTotal);
    addSection('Liabilities', statement.financialPosition.liabilities, statement.financialPosition.liabilitiesTotal);
    addSection('Equity', statement.financialPosition.equity, statement.financialPosition.equityTotal);
    rows.push({ section: '', code: '', name: 'Net assets', amount: statement.financialPosition.netAssets });

    const buffer = await buildExcelExport(
      'Financial Statement',
      [
        { header: 'Section', key: 'section', width: 14 },
        { header: 'Account code', key: 'code', width: 12 },
        { header: 'Account name', key: 'name', width: 32 },
        { header: 'Amount', key: 'amount', width: 16, numeric: true },
      ],
      rows,
      `Financial Statement${from ? ` — ${from} to ${to || 'present'}` : ''}`,
    );
    sendExcelFile(res, buffer, `financial-statement${from ? `-${from}-to-${to || 'now'}` : ''}.xlsx`);
  }
}
