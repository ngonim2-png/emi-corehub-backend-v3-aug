import { Controller, Get } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from '../identity-access/entities/user.entity';

/**
 * Any authenticated user can look up "who are our marketers" - this is
 * reference data needed to populate dropdowns in Payments, Wallets and
 * Marketing screens. It deliberately returns only id + fullName (never
 * email, phone, or role details), unlike UsersController which is
 * Super-Admin-only and returns full records.
 */
@Controller('directory')
export class DirectoryController {
  constructor(
    @InjectRepository(UserEntity) private readonly usersRepo: Repository<UserEntity>,
  ) {}

  @Get('marketers')
  async marketers() {
    const users = await this.usersRepo.find({ relations: ['role'] });
    return users
      .filter((u) => u.role?.name === 'Marketer / Agent')
      .map((u) => ({ id: u.id, fullName: u.fullName }));
  }

  /** Every active staff member, not just marketers - for assigning things like calendar events to any colleague, not only field agents. Same minimal id+fullName shape, same reasoning as marketers() above. */
  @Get('staff')
  async staff() {
    const users = await this.usersRepo.find({ relations: ['role'], where: { status: 'Active' } });
    return users.map((u) => ({ id: u.id, fullName: u.fullName, role: u.role?.name ?? '' }));
  }
}
