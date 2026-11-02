import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientEntity } from '../clients-policies/entities/client.entity';
import { PolicyEntity } from '../clients-policies/entities/policy.entity';
import { ProductEntity } from '../clients-policies/entities/product.entity';
import { BeneficiaryEntity } from '../clients-policies/entities/beneficiary.entity';
import { ClaimEntity } from '../claims/entities/claim.entity';
import { LoanEntity } from '../loans/entities/loan.entity';
import { LoanRepaymentEntity } from '../loans/entities/loan-repayment.entity';
import { PaymentEntity } from '../field-collection-wallet/entities/payment.entity';
import { ClientsPoliciesModule } from '../clients-policies/clients-policies.module';
import { FieldCollectionWalletModule } from '../field-collection-wallet/field-collection-wallet.module';
import { ClaimsModule } from '../claims/claims.module';
import { LoansModule } from '../loans/loans.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ClientAppAccountEntity } from './entities/client-app-account.entity';
import { AppApplicantEntity } from './entities/app-applicant.entity';
import { AppVerificationCodeEntity } from './entities/app-verification-code.entity';
import { AppApplicationEntity } from './entities/app-application.entity';
import { AppFileEntity } from './entities/app-file.entity';
import { AppPushSubscriptionEntity } from './entities/app-push-subscription.entity';
import { AppNotificationEntity } from './entities/app-notification.entity';
import { AppRequestEntity } from './entities/app-request.entity';
import { AppAuthService } from './app-auth.service';
import { AppAuthGuard } from './app-auth.guard';
import { AppClientService } from './app-client.service';
import { AppApplicationsService } from './app-applications.service';
import { AppStatementService } from './app-statement.service';
import { AppPushService } from './app-push.service';
import { AppAdminService } from './app-admin.service';
import { AppEventsListener } from './app-events.listener';
import { AppPublicController, AppSharedController, AppClientController, AppApplicantController, AppAdminController } from './app.controllers';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ClientEntity, PolicyEntity, ProductEntity, BeneficiaryEntity, ClaimEntity, LoanEntity, LoanRepaymentEntity, PaymentEntity,
      ClientAppAccountEntity, AppApplicantEntity, AppVerificationCodeEntity, AppApplicationEntity, AppFileEntity,
      AppPushSubscriptionEntity, AppNotificationEntity, AppRequestEntity,
    ]),
    ClientsPoliciesModule,
    FieldCollectionWalletModule,
    ClaimsModule,
    LoansModule,
    NotificationsModule,
  ],
  providers: [
    AppAuthService, AppAuthGuard, AppClientService, AppApplicationsService, AppStatementService, AppPushService, AppAdminService, AppEventsListener,
  ],
  controllers: [AppPublicController, AppSharedController, AppClientController, AppApplicantController, AppAdminController],
})
export class ClientAppModule {}
