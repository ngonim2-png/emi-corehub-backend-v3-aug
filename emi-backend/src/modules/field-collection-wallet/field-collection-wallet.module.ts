import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentEntity } from './entities/payment.entity';
import { WalletTransactionEntity } from './entities/wallet-transaction.entity';
import { CashReconciliationEntity } from './entities/cash-reconciliation.entity';
import { PolicyEntity } from '../clients-policies/entities/policy.entity';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { WalletsService } from './wallets.service';
import { WalletsController } from './wallets.controller';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PaymentEntity,
      WalletTransactionEntity,
      CashReconciliationEntity,
      PolicyEntity,
    ]),
    AuditModule,
  ],
  providers: [PaymentsService, WalletsService],
  controllers: [PaymentsController, WalletsController],
  exports: [PaymentsService, WalletsService],
})
export class FieldCollectionWalletModule {}
