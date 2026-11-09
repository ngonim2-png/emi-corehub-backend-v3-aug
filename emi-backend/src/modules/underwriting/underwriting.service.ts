import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { UnderwritingCaseEntity } from './entities/underwriting-case.entity';
import { ClientEntity } from '../clients-policies/entities/client.entity';
import { ProductEntity } from '../clients-policies/entities/product.entity';
import { CreateUnderwritingCaseDto } from './dto/create-underwriting-case.dto';
import { DecideUnderwritingDto } from './dto/decide-underwriting.dto';
import { DomainEvents } from '../../common/events/domain-events';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

@Injectable()
export class UnderwritingService {
  constructor(
    @InjectRepository(UnderwritingCaseEntity)
    private readonly casesRepo: Repository<UnderwritingCaseEntity>,
    @InjectRepository(ClientEntity) private readonly clientsRepo: Repository<ClientEntity>,
    @InjectRepository(ProductEntity) private readonly productsRepo: Repository<ProductEntity>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(dto: CreateUnderwritingCaseDto): Promise<UnderwritingCaseEntity> {
    const client = await this.clientsRepo.findOneOrFail({ where: { id: dto.clientId } });
    const product = await this.productsRepo.findOneOrFail({ where: { id: dto.productId } });
    const uwCase = this.casesRepo.create({
      client,
      product,
      sumAssured: dto.sumAssured.toFixed(2),
      riskAnswers: dto.riskAnswers ?? null,
      decision: 'Pending',
    });
    return this.casesRepo.save(uwCase);
  }

  async findOne(id: string): Promise<UnderwritingCaseEntity> {
    const uwCase = await this.casesRepo.findOne({ where: { id } });
    if (!uwCase) throw new NotFoundException('Underwriting case not found');
    return uwCase;
  }

  async findAll(status?: string): Promise<UnderwritingCaseEntity[]> {
    return this.casesRepo.find({
      where: status ? { decision: status as UnderwritingCaseEntity['decision'] } : {},
      order: { createdAt: 'DESC' },
    });
  }

  async findAllWithRelations(): Promise<UnderwritingCaseEntity[]> {
    return this.casesRepo.find({
      relations: ['client', 'product'],
      order: { createdAt: 'DESC' },
    });
  }

  async decide(
    id: string,
    dto: DecideUnderwritingDto,
    actor: AuthenticatedUser,
  ): Promise<UnderwritingCaseEntity> {
    await this.casesRepo.update(id, {
      decision: dto.decision,
      decisionReason: dto.reason ?? null,
      decidedBy: actor.id,
      decidedAt: new Date(),
    });
    const event =
      dto.decision === 'Approved' ? DomainEvents.UnderwritingApproved : DomainEvents.UnderwritingDeclined;
    this.eventEmitter.emit(event, { underwritingCaseId: id });
    return this.findOne(id);
  }
}
