import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DepartmentEntity, RequisitionApprovalEntity, RequisitionEntity, RequisitionItemEntity } from './entities/requisition.entity';
import { RequisitionsService } from './requisitions.service';
import { RequisitionsController } from './requisitions.controller';
import { UserEntity } from '../identity-access/entities/user.entity';
import { EmployeeEntity } from '../hr/entities/employee.entity';
import { ChartOfAccountEntity } from '../finance-ifrs17/entities/chart-of-account.entity';
import { AssetEntity } from '../administration/entities/asset.entity';
import { BudgetLineEntity } from '../finance-ifrs17/entities/budget-line.entity';
import { FinanceIfrs17Module } from '../finance-ifrs17/finance-ifrs17.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([RequisitionEntity, RequisitionItemEntity, RequisitionApprovalEntity, DepartmentEntity, UserEntity, EmployeeEntity, ChartOfAccountEntity, AssetEntity, BudgetLineEntity]),
    FinanceIfrs17Module,
  ],
  providers: [RequisitionsService],
  controllers: [RequisitionsController],
  exports: [RequisitionsService],
})
export class RequisitionsModule {}
