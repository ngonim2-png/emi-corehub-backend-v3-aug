import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientEntity } from '../clients-policies/entities/client.entity';
import { PolicyEntity } from '../clients-policies/entities/policy.entity';
import { ClaimEntity } from '../claims/entities/claim.entity';
import { PortalAuthService } from './portal-auth.service';
import { PortalAuthGuard } from './portal-auth.guard';
import { PortalDataService } from './portal-data.service';
import { PortalController } from './portal.controller';
import { FieldCollectionWalletModule } from '../field-collection-wallet/field-collection-wallet.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ClientEntity, PolicyEntity, ClaimEntity]),
    FieldCollectionWalletModule,
  ],
  providers: [PortalAuthService, PortalAuthGuard, PortalDataService],
  controllers: [PortalController],
})
export class ClientPortalModule {}
