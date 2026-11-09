import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DeductionImportRecordEntity } from './entities/deduction-import-record.entity';
import { PolicyEntity } from '../clients-policies/entities/policy.entity';
import { PaymentEntity } from '../field-collection-wallet/entities/payment.entity';
import { DeductionImportService } from './deduction-import.service';
import { DeductionImportController } from './deduction-import.controller';
import { FieldCollectionWalletModule } from '../field-collection-wallet/field-collection-wallet.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([DeductionImportRecordEntity, PolicyEntity, PaymentEntity]),
    FieldCollectionWalletModule,
  ],
  providers: [DeductionImportService],
  controllers: [DeductionImportController],
})
export class DeductionImportModule {}
