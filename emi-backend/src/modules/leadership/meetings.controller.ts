import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuditLog } from '../../common/decorators/audit-log.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { MeetingsService } from './meetings.service';
import { MeetingType } from './entities/meeting.entity';

@Controller('leadership/meetings')
@Roles('Super Admin')
export class MeetingsController {
  constructor(private readonly meetingsService: MeetingsService) {}

  @Post()
  @AuditLog({ action: 'leadership.meeting_created', entityType: 'leadership_meeting' })
  async create(
    @Body('type') type: MeetingType,
    @Body('date') date: string,
    @Body('time') time: string | undefined,
    @Body('notes') notes: string | undefined,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.meetingsService.create({ type, date, time, notes }, actor);
  }

  @Get()
  async findAll(@Query('type') type?: string) {
    return this.meetingsService.findAll(type);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.meetingsService.findOne(id);
  }

  @Post(':id/notes')
  async updateNotes(@Param('id') id: string, @Body('notes') notes: string) {
    return this.meetingsService.updateNotes(id, notes);
  }

  @Post(':id/complete')
  async complete(@Param('id') id: string) {
    return this.meetingsService.complete(id);
  }
}
