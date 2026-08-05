import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { FinancialReportsService } from './financial-reports.service';

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
}

@Controller('reports')
export class CashFlowController {
  constructor(private readonly financialReportsService: FinancialReportsService) {}

  @Get('cash-flow')
  async cashFlow(@Query('from') from: string, @Query('to') to: string, @Query('cashAccountCode') cashAccountCode?: string) {
    return this.financialReportsService.cashFlowStatement(from, to, cashAccountCode);
  }
}
