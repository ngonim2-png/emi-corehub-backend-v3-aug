import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RosterImportIssueEntity } from './entities/roster-import-issue.entity';
import { PolicyEntity } from '../clients-policies/entities/policy.entity';
import { ProductEntity } from '../clients-policies/entities/product.entity';
import { RosterImportService } from './roster-import.service';
import { RosterImportController } from './roster-import.controller';
import { ClientsPoliciesModule } from '../clients-policies/clients-policies.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([RosterImportIssueEntity, PolicyEntity, ProductEntity]),
    ClientsPoliciesModule,
  ],
  providers: [RosterImportService],
  controllers: [RosterImportController],
})
export class RosterImportModule {}
