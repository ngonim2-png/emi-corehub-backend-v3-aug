import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MeetingEntity } from './entities/meeting.entity';
import { GoalEntity } from './entities/goal.entity';
import { TargetEntity } from './entities/target.entity';
import { TargetAssignmentEntity } from './entities/target-assignment.entity';
import { ActionItemEntity } from './entities/action-item.entity';
import { MeetingsService } from './meetings.service';
import { GoalsService } from './goals.service';
import { TargetsService } from './targets.service';
import { ActionItemsService } from './action-items.service';
import { LeadershipReportsService } from './leadership-reports.service';
import { MeetingsController } from './meetings.controller';
import { GoalsController } from './goals.controller';
import { TargetsController } from './targets.controller';
import { ActionItemsController } from './action-items.controller';
import { LeadershipReportsController } from './leadership-reports.controller';
import { CalendarModule } from '../calendar/calendar.module';
import { ReportingAiModule } from '../reporting-ai/reporting-ai.module';
import { ClientsPoliciesModule } from '../clients-policies/clients-policies.module';
import { FieldCollectionWalletModule } from '../field-collection-wallet/field-collection-wallet.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([MeetingEntity, GoalEntity, TargetEntity, TargetAssignmentEntity, ActionItemEntity]),
    CalendarModule,
    ReportingAiModule,
    ClientsPoliciesModule,
    FieldCollectionWalletModule,
  ],
  providers: [MeetingsService, GoalsService, TargetsService, ActionItemsService, LeadershipReportsService],
  controllers: [MeetingsController, GoalsController, TargetsController, ActionItemsController, LeadershipReportsController],
})
export class LeadershipModule {}
