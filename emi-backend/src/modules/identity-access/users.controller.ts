import { BadRequestException, Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuditLog } from '../../common/decorators/audit-log.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';

@Controller('users')
@Roles('Super Admin')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @AuditLog({ action: 'user.created', entityType: 'user' })
  async create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Get()
  async findAll(@Query('role') role?: string) {
    return this.usersService.findAll(role);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.usersService.findById(id);
  }

  /**
   * Pause/resume access - the "Supreme Admin should be able to pause
   * user access" requirement. Restricted beyond the class-level Super
   * Admin gate to Supreme Admin specifically, since this is a step up
   * from ordinary user administration.
   */
  @Post(':id/status')
  @Roles('Supreme Admin')
  @AuditLog({ action: 'user.status_changed', entityType: 'user' })
  async setStatus(
    @Param('id') id: string,
    @Body('status') status: 'Active' | 'Suspended' | 'Disabled',
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    if (id === actor.id) {
      throw new BadRequestException('You cannot change your own account status.');
    }
    return this.usersService.setStatus(id, status);
  }

  @Post(':id/reset-password')
  @Roles('Supreme Admin')
  @AuditLog({ action: 'user.password_reset', entityType: 'user' })
  async resetPassword(@Param('id') id: string, @Body('newPassword') newPassword: string) {
    await this.usersService.resetPassword(id, newPassword);
    return { reset: true };
  }

  @Post(':id/edit')
  @Roles('Supreme Admin')
  @AuditLog({ action: 'user.edited', entityType: 'user' })
  async edit(
    @Param('id') id: string,
    @Body() fields: { fullName?: string; email?: string; phone?: string; roleId?: string; branchId?: string },
  ) {
    return this.usersService.updateFields(id, fields);
  }
}
