import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IsString } from 'class-validator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuditLog } from '../../common/decorators/audit-log.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { DeviceEntity } from './entities/device.entity';
import { UserEntity } from './entities/user.entity';

export class RegisterDeviceDto {
  @IsString()
  deviceFingerprint: string;
}

/**
 * Field marketers must post payments only from an approved device (see
 * the spec's "device registration for marketers" requirement). This
 * scaffold doesn't yet enforce the check inside PaymentsService itself
 * (that's the next hardening step, not done here) - what's built is the
 * registration and approval workflow: a device self-registers as
 * unapproved, and a Super Admin/Branch Manager approves it before it's
 * trusted.
 */
@Controller('devices')
export class DevicesController {
  constructor(
    @InjectRepository(DeviceEntity) private readonly devicesRepo: Repository<DeviceEntity>,
    @InjectRepository(UserEntity) private readonly usersRepo: Repository<UserEntity>,
  ) {}

  @Post('register')
  async register(@Body() dto: RegisterDeviceDto, @CurrentUser() actor: AuthenticatedUser) {
    const user = await this.usersRepo.findOneOrFail({ where: { id: actor.id } });
    const existing = await this.devicesRepo.findOne({
      where: { user: { id: actor.id }, deviceFingerprint: dto.deviceFingerprint },
    });
    if (existing) return existing;
    return this.devicesRepo.save(
      this.devicesRepo.create({ user, deviceFingerprint: dto.deviceFingerprint, approved: false }),
    );
  }

  @Get()
  @Roles('Super Admin', 'Branch Manager')
  async findAll(@Query('approved') approved?: string) {
    const qb = this.devicesRepo.createQueryBuilder('device').leftJoinAndSelect('device.user', 'user');
    if (approved !== undefined) qb.andWhere('device.approved = :approved', { approved: approved === 'true' });
    return qb.orderBy('device.createdAt', 'DESC').getMany();
  }

  @Post(':id/approve')
  @Roles('Super Admin', 'Branch Manager')
  @AuditLog({ action: 'device.approved', entityType: 'device' })
  async approve(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    void actor;
    await this.devicesRepo.update(id, { approved: true, lastSeenAt: new Date() });
    return this.devicesRepo.findOne({ where: { id }, relations: ['user'] });
  }

  @Post(':id/revoke')
  @Roles('Super Admin', 'Branch Manager')
  @AuditLog({ action: 'device.revoked', entityType: 'device' })
  async revoke(@Param('id') id: string) {
    await this.devicesRepo.update(id, { approved: false });
    return this.devicesRepo.findOne({ where: { id }, relations: ['user'] });
  }
}
