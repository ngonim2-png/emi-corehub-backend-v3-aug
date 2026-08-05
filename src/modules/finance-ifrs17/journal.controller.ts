import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { JournalService } from './journal.service';
import { PostJournalEntryDto } from './dto/post-journal-entry.dto';

@Controller('journal-entries')
export class JournalController {
  constructor(private readonly journalService: JournalService) {}

  @Get()
  async findRecent(
    @Query('limit') limit?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.journalService.findRecent(limit ? parseInt(limit, 10) : undefined, from, to);
  }

  // Note: no @AuditLog decorator here - JournalService.post() already
  // writes its own audit entry atomically inside the same transaction as
  // the posting. Stacking the decorator on top (as this route used to
  // have) silently doubled every journal-entry audit record - the same
  // maker/checker-adjacent mistake caught and fixed on policy
  // reinstatement and renewal earlier in this build.
  @Post()
  @Roles('Super Admin', 'Finance Manager')
  async post(@Body() dto: PostJournalEntryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.journalService.post(dto.date, dto.narration, dto.lines, 'manual', null, user);
  }

  @Post(':id/approve')
  @Roles('Super Admin', 'Finance Manager')
  async approve(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.journalService.approve(id, user);
  }

  @Post(':id/reverse')
  @Roles('Super Admin', 'Finance Manager')
  async reverse(
    @Param('id') id: string,
    @Body('narration') narration: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.journalService.reverse(id, narration, user);
  }

  @Get('periods/closed')
  async closedPeriods() {
    return this.journalService.findClosedPeriods();
  }

  @Post('periods/:period/close')
  @Roles('Super Admin', 'Finance Manager')
  async closePeriod(
    @Param('period') period: string,
    @Body('notes') notes: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.journalService.closePeriod(period, user, notes);
  }
}
