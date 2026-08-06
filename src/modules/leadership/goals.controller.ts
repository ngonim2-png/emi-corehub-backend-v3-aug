import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuditLog } from '../../common/decorators/audit-log.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { GoalsService } from './goals.service';
import { GoalStatus } from './entities/goal.entity';

@Controller('leadership/goals')
@Roles('Super Admin')
export class GoalsController {
  constructor(private readonly goalsService: GoalsService) {}

  @Post()
  @AuditLog({ action: 'leadership.goal_created', entityType: 'leadership_goal' })
  async create(
    @Body('month') month: string,
    @Body('description') description: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.goalsService.create({ month, description }, actor);
  }

  @Get()
  async findByMonth(@Query('month') month: string) {
    return this.goalsService.findByMonth(month);
  }

  @Post(':id/status')
  async setStatus(@Param('id') id: string, @Body('status') status: GoalStatus) {
    return this.goalsService.setStatus(id, status);
  }
}
