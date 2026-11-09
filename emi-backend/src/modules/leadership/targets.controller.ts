import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuditLog } from '../../common/decorators/audit-log.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { TargetsService } from './targets.service';
import { CreateTargetDto, ReviewTargetAssignmentDto } from './dto/leadership.dto';

@Controller('leadership/targets')
@Roles('Super Admin')
export class TargetsController {
  constructor(private readonly targetsService: TargetsService) {}

  @Post()
  @AuditLog({ action: 'leadership.target_created', entityType: 'leadership_target' })
  async create(@Body() dto: CreateTargetDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.targetsService.create(dto, actor);
  }

  @Get()
  async findByWeek(@Query('weekStartDate') weekStartDate: string) {
    return this.targetsService.findByWeek(weekStartDate);
  }

  @Post('assignments/:id/review')
  @AuditLog({ action: 'leadership.target_reviewed', entityType: 'leadership_target_assignment' })
  async reviewAssignment(@Param('id') id: string, @Body() dto: ReviewTargetAssignmentDto) {
    return this.targetsService.reviewAssignment(id, dto);
  }
}
