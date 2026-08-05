import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UnderwritingCaseEntity } from './entities/underwriting-case.entity';
import { ClientEntity } from '../clients-policies/entities/client.entity';
import { ProductEntity } from '../clients-policies/entities/product.entity';
import { UnderwritingService } from './underwriting.service';
import { UnderwritingController } from './underwriting.controller';

@Module({
  imports: [TypeOrmModule.forFeature([UnderwritingCaseEntity, ClientEntity, ProductEntity])],
  providers: [UnderwritingService],
  controllers: [UnderwritingController],
  exports: [UnderwritingService],
})
export class UnderwritingModule {}
