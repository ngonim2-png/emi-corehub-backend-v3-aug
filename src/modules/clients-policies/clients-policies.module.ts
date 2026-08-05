import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientEntity } from './entities/client.entity';
import { PolicyEntity } from './entities/policy.entity';
import { ProductEntity } from './entities/product.entity';
import { BeneficiaryEntity } from './entities/beneficiary.entity';
import { ClientsService } from './clients.service';
import { ClientsController } from './clients.controller';
import { PoliciesService } from './policies.service';
import { PoliciesController } from './policies.controller';
import { BeneficiariesService } from './beneficiaries.service';
import { BeneficiariesController } from './beneficiaries.controller';
import { ClientProfileController } from './client-profile.controller';
import { AuditModule } from '../audit/audit.module';
import { FieldCollectionWalletModule } from '../field-collection-wallet/field-collection-wallet.module';
import { ProductsController } from './products.controller';
import { ClaimsModule } from '../claims/claims.module';
import { UnderwritingModule } from '../underwriting/underwriting.module';
import { DocumentsModule } from '../documents/documents.module';
import { CrmModule } from '../crm/crm.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ClientEntity, PolicyEntity, ProductEntity, BeneficiaryEntity]),
    AuditModule,
    FieldCollectionWalletModule,
    ClaimsModule,
    UnderwritingModule,
    DocumentsModule,
    CrmModule,
  ],
  providers: [ClientsService, PoliciesService, BeneficiariesService],
  controllers: [
    ClientsController,
    PoliciesController,
    ProductsController,
    BeneficiariesController,
    ClientProfileController,
  ],
  exports: [ClientsService, PoliciesService, BeneficiariesService],
})
export class ClientsPoliciesModule {}
