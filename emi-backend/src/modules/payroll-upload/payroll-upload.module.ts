import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientEntity } from '../clients-policies/entities/client.entity';
import { PolicyEntity } from '../clients-policies/entities/policy.entity';
import { ProductEntity } from '../clients-policies/entities/product.entity';
import { PayrollUploadService } from './payroll-upload.service';
import { PayrollUploadController } from './payroll-upload.controller';
import { FieldCollectionWalletModule } from '../field-collection-wallet/field-collection-wallet.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ClientEntity, PolicyEntity, ProductEntity]),
    FieldCollectionWalletModule,
  ],
  providers: [PayrollUploadService],
  controllers: [PayrollUploadController],
})
export class PayrollUploadModule {}
