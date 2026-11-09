import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AssetEntity, ProcurementRequestEntity, SupplierEntity } from './entities/asset.entity';
import { AdministrationService } from './administration.service';
import { AdministrationController } from './administration.controller';
import { FinanceIfrs17Module } from '../finance-ifrs17/finance-ifrs17.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([AssetEntity, ProcurementRequestEntity, SupplierEntity]),
    FinanceIfrs17Module,
  ],
  providers: [AdministrationService],
  controllers: [AdministrationController],
  exports: [AdministrationService],
})
export class AdministrationModule {}
