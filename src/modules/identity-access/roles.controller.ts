import { Controller, Get } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RoleEntity } from './entities/role.entity';

@Controller('roles')
export class RolesController {
  constructor(@InjectRepository(RoleEntity) private readonly rolesRepo: Repository<RoleEntity>) {}

  @Get()
  async findAll() {
    return this.rolesRepo.find({ order: { name: 'ASC' } });
  }
}
