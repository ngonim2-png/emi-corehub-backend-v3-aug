import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MarketerTargetEntity } from './entities/marketer-target.entity';
import { CommissionRateEntity, CommissionPayoutEntity } from './entities/commission.entity';
import { PaymentEntity } from '../field-collection-wallet/entities/payment.entity';
import { MarketingSalesService } from './marketing-sales.service';
import { MarketingSalesController } from './marketing-sales.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([MarketerTargetEntity, CommissionRateEntity, CommissionPayoutEntity, PaymentEntity]),
  ],
  providers: [MarketingSalesService],
  controllers: [MarketingSalesController],
  exports: [MarketingSalesService],
})
export class MarketingSalesModule {}
