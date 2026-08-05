import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { AuditLog } from '../../common/decorators/audit-log.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { CalendarService, CreateCalendarEventInput } from './calendar.service';

@Controller('calendar')
export class CalendarController {
  constructor(private readonly calendarService: CalendarService) {}

  @Post()
  @AuditLog({ action: 'calendar_event.created', entityType: 'calendar_event' })
  async create(@Body() input: CreateCalendarEventInput, @CurrentUser() actor: AuthenticatedUser) {
    return this.calendarService.create(input, actor);
  }

  /** Month-grid view: pass the first and last instant of the visible range. */
  @Get()
  async findInRange(@Query('from') from: string, @Query('to') to: string) {
    return this.calendarService.findInRange(new Date(from), new Date(to));
  }

  /** My Tasks integration - this user's own upcoming/overdue events. */
  @Get('upcoming')
  async findUpcoming(@CurrentUser() actor: AuthenticatedUser, @Query('days') days?: string) {
    return this.calendarService.findUpcomingForUser(actor.id, days ? parseInt(days, 10) : undefined);
  }

  @Post(':id/edit')
  @AuditLog({ action: 'calendar_event.edited', entityType: 'calendar_event' })
  async update(@Param('id') id: string, @Body() input: Partial<CreateCalendarEventInput>) {
    return this.calendarService.update(id, input);
  }

  @Post(':id/status')
  @AuditLog({ action: 'calendar_event.status_changed', entityType: 'calendar_event' })
  async setStatus(@Param('id') id: string, @Body('status') status: string) {
    return this.calendarService.setStatus(id, status as any);
  }

  @Delete(':id')
  @AuditLog({ action: 'calendar_event.deleted', entityType: 'calendar_event' })
  async delete(@Param('id') id: string) {
    await this.calendarService.delete(id);
    return { deleted: true };
  }
}
