import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WalletTransactionEntity } from '../modules/field-collection-wallet/entities/wallet-transaction.entity';
import { Ifrs17GroupEntity } from '../modules/finance-ifrs17/entities/ifrs17-group.entity';
import { Ifrs17MeasurementEntity } from '../modules/finance-ifrs17/entities/ifrs17-measurement.entity';
import { PolicyEntity } from '../modules/clients-policies/entities/policy.entity';
import { ClientsPoliciesModule } from '../modules/clients-policies/clients-policies.module';
import { FieldCollectionWalletModule } from '../modules/field-collection-wallet/field-collection-wallet.module';
import { MarketingAutomationModule } from '../modules/marketing-automation/marketing-automation.module';
import { LapseDetectionProcessor } from './lapse-detection.processor';
import { WalletReconciliationProcessor } from './wallet-reconciliation.processor';
import { TokenExpiryProcessor } from './token-expiry.processor';
import { Ifrs17BatchCloseProcessor } from './ifrs17-batch-close.processor';
import { LifecycleTriggersProcessor } from './lifecycle-triggers.processor';
import { SchedulerService } from './scheduler.service';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'jobs' }),
    TypeOrmModule.forFeature([
      WalletTransactionEntity,
      Ifrs17GroupEntity,
      Ifrs17MeasurementEntity,
      PolicyEntity,
    ]),
    ClientsPoliciesModule,
    FieldCollectionWalletModule,
    MarketingAutomationModule,
  ],
  providers: [
    LapseDetectionProcessor,
    WalletReconciliationProcessor,
    TokenExpiryProcessor,
    Ifrs17BatchCloseProcessor,
    LifecycleTriggersProcessor,
    SchedulerService,
  ],
})
export class JobsModule {}
