import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BranchEntity } from './entities/branch.entity';
import { ClientEntity } from '../clients-policies/entities/client.entity';
import { UserEntity } from '../identity-access/entities/user.entity';
import { CreateBranchDto } from './dto/create-branch.dto';

export interface BranchSummary {
  branchId: string;
  name: string;
  district: string | null;
  clientCount: number;
  staffCount: number;
}

@Injectable()
export class BranchesService {
  constructor(
    @InjectRepository(BranchEntity) private readonly branchesRepo: Repository<BranchEntity>,
    @InjectRepository(ClientEntity) private readonly clientsRepo: Repository<ClientEntity>,
    @InjectRepository(UserEntity) private readonly usersRepo: Repository<UserEntity>,
  ) {}

  async create(dto: CreateBranchDto): Promise<BranchEntity> {
    return this.branchesRepo.save(this.branchesRepo.create({ ...dto, status: 'Active' }));
  }

  async findAll(): Promise<BranchEntity[]> {
    return this.branchesRepo.find({ order: { name: 'ASC' } });
  }

  async summary(): Promise<BranchSummary[]> {
    const branches = await this.branchesRepo.find();
    const results: BranchSummary[] = [];
    for (const branch of branches) {
      const clientCount = await this.clientsRepo.count({ where: { branchId: branch.id } });
      const staffCount = await this.usersRepo.count({ where: { branchId: branch.id } });
      results.push({ branchId: branch.id, name: branch.name, district: branch.district, clientCount, staffCount });
    }
    return results;
  }
}
