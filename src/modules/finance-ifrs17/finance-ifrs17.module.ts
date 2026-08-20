import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChartOfAccountEntity } from './entities/chart-of-account.entity';
import { JournalEntryEntity, JournalLineEntity } from './entities/journal-entry.entity';
import { Ifrs17GroupEntity } from './entities/ifrs17-group.entity';
import { Ifrs17MeasurementEntity } from './entities/ifrs17-measurement.entity';
import { AccountingPeriodEntity } from './entities/accounting-period.entity';
import { BankAccountEntity, BankStatementLineEntity } from './entities/bank-account.entity';
import { BankAccountDeletionRequestEntity } from './entities/bank-account-deletion-request.entity';
import { BudgetLineEntity } from './entities/budget-line.entity';
import { JournalService } from './journal.service';
import { JournalController } from './journal.controller';
import { ReportsController } from './reports.controller';
import { FinancialReportsService } from './financial-reports.service';
import { BankReconciliationController, BudgetController, CashFlowController } from './financial-reports.controller';
import { Ifrs17Controller } from './ifrs17.controller';
import { FinanceEventListener } from './finance-event.listener';
import { AuditModule } from '../audit/audit.module';
import { JobsModule } from '../../jobs/jobs.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ChartOfAccountEntity,
      JournalEntryEntity,
      JournalLineEntity,
      Ifrs17GroupEntity,
      Ifrs17MeasurementEntity,
      AccountingPeriodEntity,
      BankAccountEntity,
      BankStatementLineEntity,
      BankAccountDeletionRequestEntity,
      BudgetLineEntity,
    ]),
    AuditModule,
    JobsModule,
  ],
  providers: [JournalService, FinancialReportsService, FinanceEventListener],
  controllers: [JournalController, ReportsController, BankReconciliationController, BudgetController, CashFlowController, Ifrs17Controller],
  exports: [JournalService, FinancialReportsService],
})
export class FinanceIfrs17Module {}
