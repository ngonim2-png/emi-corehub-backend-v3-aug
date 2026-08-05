import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { v4 as uuid } from 'uuid';
import { ClaimEntity, ClaimStatus } from './entities/claim.entity';
import { PolicyEntity } from '../clients-policies/entities/policy.entity';
import { CreateClaimDto } from './dto/create-claim.dto';
import { DomainEvents, ClaimStatusEvent } from '../../common/events/domain-events';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

const FLOW: ClaimStatus[] = ['Registered', 'Under Review', 'Approved', 'Paid'];

@Injectable()
export class ClaimsService {
  constructor(
    @InjectRepository(ClaimEntity) private readonly claimsRepo: Repository<ClaimEntity>,
    @InjectRepository(PolicyEntity) private readonly policiesRepo: Repository<PolicyEntity>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(dto: CreateClaimDto): Promise<ClaimEntity> {
    const policy = await this.policiesRepo.findOneOrFail({ where: { id: dto.policyId } });
    const claim = this.claimsRepo.create({
      claimNo: `CLM-${uuid().slice(0, 8).toUpperCase()}`,
      policy,
      claimType: dto.claimType,
      amountClaimed: dto.amountClaimed.toFixed(2),
      dateReported: dto.dateReported,
      status: 'Registered',
    });
    const saved = await this.claimsRepo.save(claim);
    this.eventEmitter.emit(DomainEvents.ClaimRegistered, { claimId: saved.id });
    return saved;
  }

  async findOne(id: string): Promise<ClaimEntity> {
    const claim = await this.claimsRepo.findOne({ where: { id }, relations: ['policy', 'policy.client'] });
    if (!claim) throw new NotFoundException('Claim not found');
    return claim;
  }

  async findAll(): Promise<ClaimEntity[]> {
    return this.claimsRepo.find({
      relations: ['policy', 'policy.client'],
      order: { createdAt: 'DESC' },
    });
  }

  async advance(
    id: string,
    actor: AuthenticatedUser,
    payoutDetails?: { datePaid?: string; paymentMethod?: string },
  ): Promise<ClaimEntity> {
    const claim = await this.findOne(id);
    const idx = FLOW.indexOf(claim.status);
    if (idx === -1 || idx === FLOW.length - 1) {
      throw new BadRequestException(`Claim cannot be advanced from status ${claim.status}`);
    }
    const nextStatus = FLOW[idx + 1];
    const update: Partial<ClaimEntity> = { status: nextStatus, decidedBy: actor.id };
    if (nextStatus === 'Paid') {
      update.datePaid = payoutDetails?.datePaid || new Date().toISOString().slice(0, 10);
      update.paymentMethod = payoutDetails?.paymentMethod || null;
    }
    await this.claimsRepo.update(id, update);

    const event: ClaimStatusEvent = {
      claimId: id,
      clientId: claim.policy.client.id,
      clientPhone: claim.policy.client.phone,
      clientName: claim.policy.client.fullName,
      policyNumber: claim.policy.policyNo,
      amountMajor: Number(claim.amountApproved ?? claim.amountClaimed),
      status: nextStatus,
    };
    if (nextStatus === 'Approved') this.eventEmitter.emit(DomainEvents.ClaimApproved, event);
    if (nextStatus === 'Paid') this.eventEmitter.emit(DomainEvents.ClaimPaid, event);

    return this.findOne(id);
  }

  async reject(id: string, actor: AuthenticatedUser): Promise<ClaimEntity> {
    await this.claimsRepo.update(id, { status: 'Rejected', decidedBy: actor.id });
    return this.findOne(id);
  }

  /** Reserve = the amount set aside on the books for an unresolved claim's likely payout. */
  async setReserve(id: string, reserveAmount: number): Promise<ClaimEntity> {
    await this.claimsRepo.update(id, { reserveAmount: reserveAmount.toFixed(2) });
    return this.findOne(id);
  }
}
