import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { SmsLogEntity } from './sms-log.entity';
import { SmsCampaignEntity } from './sms-campaign.entity';
import { EmailLogEntity } from './email-log.entity';
import { ClientEntity } from '../clients-policies/entities/client.entity';
import { UserEntity } from '../identity-access/entities/user.entity';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsEventListener } from './notifications-event.listener';
import { SmsProcessor } from './sms.processor';
import { BulkSmsProcessor } from './bulk-sms.processor';
import { SMS_GATEWAY } from './adapters/sms-gateway.adapter';
import { OrangeSmsAdapter } from './adapters/orange-sms.adapter';
import { AlemobetSmsAdapter } from './adapters/alemobet-sms.adapter';
import { EMAIL_GATEWAY } from './adapters/email-gateway.adapter';
import { SmtpEmailAdapter } from './adapters/smtp-email.adapter';
import { EmailService } from './email.service';
import { EmailController } from './email.controller';
import { EmailProcessor } from './email.processor';
import { ClientsPoliciesModule } from '../clients-policies/clients-policies.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SmsLogEntity, SmsCampaignEntity, EmailLogEntity, ClientEntity, UserEntity]),
    BullModule.registerQueue({ name: 'sms' }, { name: 'bulk-sms' }, { name: 'email' }),
    ClientsPoliciesModule,
  ],
  providers: [
    NotificationsService,
    NotificationsEventListener,
    SmsProcessor,
    BulkSmsProcessor,
    EmailService,
    EmailProcessor,
    OrangeSmsAdapter,
    AlemobetSmsAdapter,
    {
      provide: SMS_GATEWAY,
      useFactory: (config: ConfigService, alemobet: AlemobetSmsAdapter, orange: OrangeSmsAdapter) =>
        config.get<string>('sms.provider') === 'orange' ? orange : alemobet,
      inject: [ConfigService, AlemobetSmsAdapter, OrangeSmsAdapter],
    },
    { provide: EMAIL_GATEWAY, useClass: SmtpEmailAdapter },
  ],
  controllers: [NotificationsController, EmailController],
  exports: [NotificationsService, EmailService],
})
export class NotificationsModule {}
