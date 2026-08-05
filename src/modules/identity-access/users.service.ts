import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from './entities/user.entity';
import { RoleEntity } from './entities/role.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { hashPassword } from '../../common/utils/password.util';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity) private readonly usersRepo: Repository<UserEntity>,
    @InjectRepository(RoleEntity) private readonly rolesRepo: Repository<RoleEntity>,
  ) {}

  async findByEmailWithPassword(email: string): Promise<UserEntity | null> {
    return this.usersRepo
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .addSelect('user.mfaSecret')
      .leftJoinAndSelect('user.role', 'role')
      .where('user.email = :email', { email })
      .getOne();
  }

  async findById(id: string): Promise<UserEntity> {
    const user = await this.usersRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async findAll(roleName?: string): Promise<UserEntity[]> {
    const qb = this.usersRepo.createQueryBuilder('user').leftJoinAndSelect('user.role', 'role');
    if (roleName) qb.andWhere('role.name = :roleName', { roleName });
    return qb.orderBy('user.fullName', 'ASC').getMany();
  }

  async create(dto: CreateUserDto): Promise<UserEntity> {
    const role = await this.rolesRepo.findOneOrFail({ where: { id: dto.roleId } });
    const passwordHash = await hashPassword(dto.password);
    const user = this.usersRepo.create({
      fullName: dto.fullName,
      email: dto.email,
      phone: dto.phone,
      passwordHash,
      role,
      branchId: dto.branchId ?? null,
    });
    return this.usersRepo.save(user);
  }

  async recordLogin(userId: string): Promise<void> {
    await this.usersRepo.update(userId, { lastLoginAt: new Date() });
  }

  /** Stores a freshly generated TOTP secret, not yet enabled - enableMfa() flips it on after the user proves they can generate a valid code. */
  async setPendingMfaSecret(userId: string, secret: string): Promise<void> {
    await this.usersRepo.update(userId, { mfaSecret: secret });
  }

  async enableMfa(userId: string): Promise<void> {
    await this.usersRepo.update(userId, { mfaEnabled: true });
  }

  async disableMfa(userId: string): Promise<void> {
    await this.usersRepo.update(userId, { mfaEnabled: false, mfaSecret: null });
  }

  /** Pausing/resuming access - self-lockout is blocked at the controller, not here, so this stays a pure data operation. */
  async setStatus(userId: string, status: 'Active' | 'Suspended' | 'Disabled'): Promise<UserEntity> {
    await this.usersRepo.update(userId, { status });
    return this.findById(userId);
  }

  /** Supreme Admin setting a new password directly, no knowledge of the old one required - a real admin override, not a self-service reset. */
  async resetPassword(userId: string, newPassword: string): Promise<void> {
    const passwordHash = await hashPassword(newPassword);
    await this.usersRepo.update(userId, { passwordHash });
  }

  async updateFields(
    userId: string,
    fields: { fullName?: string; email?: string; phone?: string; roleId?: string; branchId?: string },
  ): Promise<UserEntity> {
    const update: Partial<UserEntity> = {};
    if (fields.fullName !== undefined) update.fullName = fields.fullName;
    if (fields.email !== undefined) update.email = fields.email;
    if (fields.phone !== undefined) update.phone = fields.phone;
    if (fields.branchId !== undefined) update.branchId = fields.branchId;
    if (fields.roleId) {
      update.role = await this.rolesRepo.findOneOrFail({ where: { id: fields.roleId } });
    }
    await this.usersRepo.update(userId, update);
    return this.findById(userId);
  }
}
