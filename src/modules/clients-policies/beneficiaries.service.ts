import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BeneficiaryEntity } from './entities/beneficiary.entity';
import { ClientEntity } from './entities/client.entity';
import { CreateBeneficiaryDto } from './dto/create-beneficiary.dto';

@Injectable()
export class BeneficiariesService {
  constructor(
    @InjectRepository(BeneficiaryEntity) private readonly beneficiariesRepo: Repository<BeneficiaryEntity>,
    @InjectRepository(ClientEntity) private readonly clientsRepo: Repository<ClientEntity>,
  ) {}

  async create(dto: CreateBeneficiaryDto): Promise<BeneficiaryEntity> {
    const client = await this.clientsRepo.findOneOrFail({ where: { id: dto.clientId } });
    return this.beneficiariesRepo.save(
      this.beneficiariesRepo.create({
        client,
        name: dto.name,
        relationship: dto.relationship,
        phone: dto.phone,
        sharePct: (dto.sharePct ?? 100).toFixed(2),
      }),
    );
  }

  async findByClient(clientId: string): Promise<BeneficiaryEntity[]> {
    return this.beneficiariesRepo.find({ where: { client: { id: clientId } } });
  }

  async remove(id: string): Promise<void> {
    await this.beneficiariesRepo.delete(id);
  }
}
