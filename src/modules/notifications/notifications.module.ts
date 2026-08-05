import { Module } from '@nestjs/common';
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
import { EMAIL_GATEWAY } from './adapters/email-gateway.adapter';
import { SmtpEmailAdapter } from './adapters/smtp-email.adapter';
import { EmailService } from './email.service';
import { EmailController } from './email.controller';
import { EmailProcessor } from './email.processor';

@Module({
  imports: [
    TypeOrmModule.forFeature([SmsLogEntity, SmsCampaignEntity, EmailLogEntity, ClientEntity, UserEntity]),
    BullModule.registerQueue({ name: 'sms' }, { name: 'bulk-sms' }, { name: 'email' }),
  ],
  providers: [
    NotificationsService,
    NotificationsEventListener,
    SmsProcessor,
    BulkSmsProcessor,
    EmailService,
    EmailProcessor,
    { provide: SMS_GATEWAY, useClass: OrangeSmsAdapter },
    { provide: EMAIL_GATEWAY, useClass: SmtpEmailAdapter },
  ],
  controllers: [NotificationsController, EmailController],
  exports: [NotificationsService, EmailService],
})
export class NotificationsModule {}
