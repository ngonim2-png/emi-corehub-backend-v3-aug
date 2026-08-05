import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LifecycleTriggerEntity, TriggerFireEntity } from './entities/lifecycle-trigger.entity';
import { SocialPostEntity } from './entities/social-post.entity';
import { PolicyEntity } from '../clients-policies/entities/policy.entity';
import { ClientEntity } from '../clients-policies/entities/client.entity';
import { LeadEntity } from '../crm/entities/lead.entity';
import { SmsCampaignEntity } from '../notifications/sms-campaign.entity';
import { LifecycleTriggersService } from './lifecycle-triggers.service';
import {
  LifecycleTriggersController,
  SocialPostsController,
} from './lifecycle-triggers.controller';
import { MarketingAnalyticsService } from './marketing-analytics.service';
import { MarketingAnalyticsController } from './marketing-analytics.controller';
import { FieldCollectionWalletModule } from '../field-collection-wallet/field-collection-wallet.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      LifecycleTriggerEntity,
      TriggerFireEntity,
      SocialPostEntity,
      PolicyEntity,
      ClientEntity,
      LeadEntity,
      SmsCampaignEntity,
    ]),
    FieldCollectionWalletModule,
    NotificationsModule,
  ],
  providers: [LifecycleTriggersService, MarketingAnalyticsService],
  controllers: [LifecycleTriggersController, SocialPostsController, MarketingAnalyticsController],
  exports: [LifecycleTriggersService],
})
export class MarketingAutomationModule {}
