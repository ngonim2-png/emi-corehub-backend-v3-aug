import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LoanEntity } from './entities/loan.entity';
import { LoanRepaymentEntity } from './entities/loan-repayment.entity';
import { PaymentEntity } from '../field-collection-wallet/entities/payment.entity';
import { SmsLogEntity } from '../notifications/sms-log.entity';
import { AppFileEntity } from '../client-app/entities/app-file.entity';
import { PolicyEntity } from '../clients-policies/entities/policy.entity';
import { ClientEntity } from '../clients-policies/entities/client.entity';
import { LoansService } from './loans.service';
import { LoansController } from './loans.controller';

@Module({
  imports: [TypeOrmModule.forFeature([LoanEntity, LoanRepaymentEntity, PaymentEntity, ClientEntity, PolicyEntity, AppFileEntity, SmsLogEntity])],
  providers: [LoansService],
  controllers: [LoansController],
  exports: [LoansService],
})
export class LoansModule {}
