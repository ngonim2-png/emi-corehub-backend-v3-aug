import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuditLog } from '../../common/decorators/audit-log.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { SmsLogEntity } from './sms-log.entity';
import { NotificationsService } from './notifications.service';
import { SendBulkSmsDto } from './dto/send-bulk-sms.dto';

@Controller('notifications')
export class NotificationsController {
  constructor(
    @InjectRepository(SmsLogEntity) private readonly smsLogRepo: Repository<SmsLogEntity>,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Get('sms-logs')
  async findRecent(@Query('limit') limit?: string) {
    return this.smsLogRepo.find({
      order: { createdAt: 'DESC' },
      take: limit ? parseInt(limit, 10) : 100,
    });
  }

  /** Lets the UI show "this will reach N people" before anything is actually queued. */
  @Post('bulk-sms/preview-audience')
  @Roles('Super Admin', 'Branch Manager')
  async previewAudience(@Body() dto: Pick<SendBulkSmsDto, 'audienceType' | 'filters' | 'customPhones'>) {
    const phones = await this.notificationsService.resolveAudience(dto);
    return { recipientCount: phones.length };
  }

  @Post('bulk-sms')
  @Roles('Super Admin', 'Branch Manager')
  @AuditLog({ action: 'sms.bulk_campaign_sent', entityType: 'sms_campaign' })
  async sendBulk(@Body() dto: SendBulkSmsDto, @CurrentUser() user: AuthenticatedUser) {
    return this.notificationsService.sendBulk(dto, user);
  }

  @Get('campaigns')
  async findCampaigns(@Query('limit') limit?: string) {
    return this.notificationsService.findCampaigns(limit ? parseInt(limit, 10) : undefined);
  }

  @Get('campaigns/:id')
  async findCampaign(@Param('id') id: string) {
    return this.notificationsService.findCampaign(id);
  }
}
