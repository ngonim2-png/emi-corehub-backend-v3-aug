import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentEntity } from '../field-collection-wallet/entities/payment.entity';
import { ClaimEntity } from '../claims/entities/claim.entity';
import { UserEntity } from '../identity-access/entities/user.entity';
import { SlicomMonthlyService } from './slicom-monthly.service';
import { SlicomMonthlyController } from './slicom-monthly.controller';

@Module({
  imports: [TypeOrmModule.forFeature([PaymentEntity, ClaimEntity, UserEntity])],
  providers: [SlicomMonthlyService],
  controllers: [SlicomMonthlyController],
})
export class RegulatoryFormsModule {}
