import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuditLog } from '../../common/decorators/audit-log.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { ActionItemsService } from './action-items.service';
import { CreateActionItemDto } from './dto/leadership.dto';

@Controller('leadership/action-items')
@Roles('Super Admin')
export class ActionItemsController {
  constructor(private readonly actionItemsService: ActionItemsService) {}

  @Post()
  @AuditLog({ action: 'leadership.action_item_created', entityType: 'leadership_action_item' })
  async create(@Body() dto: CreateActionItemDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.actionItemsService.create(dto, actor);
  }

  @Get()
  async findAll(
    @Query('meetingId') meetingId?: string,
    @Query('assignedTo') assignedTo?: string,
    @Query('status') status?: string,
  ) {
    return this.actionItemsService.findAll({ meetingId, assignedTo, status });
  }

  @Post(':id/complete')
  async complete(@Param('id') id: string) {
    return this.actionItemsService.complete(id);
  }
}
