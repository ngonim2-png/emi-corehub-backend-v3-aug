import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuditLog } from '../../common/decorators/audit-log.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { ActionItemsService } from './action-items.service';
import { CreateActionItemDto } from './dto/leadership.dto';

@Controller('leadership/action-items')
export class ActionItemsController {
  constructor(private readonly actionItemsService: ActionItemsService) {}

  @Post()
  @Roles('Super Admin')
  @AuditLog({ action: 'leadership.action_item_created', entityType: 'leadership_action_item' })
  async create(@Body() dto: CreateActionItemDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.actionItemsService.create(dto, actor);
  }

  @Get()
  @Roles('Super Admin')
  async findAll(
    @Query('meetingId') meetingId?: string,
    @Query('assignedTo') assignedTo?: string,
    @Query('status') status?: string,
  ) {
    return this.actionItemsService.findAll({ meetingId, assignedTo, status });
  }

  /**
   * Deliberately no @Roles here - any authenticated user can reach this
   * route, but the service itself only lets you complete an item that's
   * actually assigned to you (or lets an admin complete any of them).
   * The assignee is the one person who legitimately needs this without
   * being a Super Admin - there was previously no way for them to mark
   * their own task done at all.
   */
  @Post(':id/complete')
  async complete(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.actionItemsService.complete(id, actor);
  }
}
