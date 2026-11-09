import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, Not } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { PolicyEntity, PolicyStatus } from './entities/policy.entity';
import { ClientEntity } from './entities/client.entity';
import { ProductEntity } from './entities/product.entity';
import { CreatePolicyDto } from './dto/create-policy.dto';
import { DomainEvents, PolicyStatusChangedEvent } from '../../common/events/domain-events';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { computePolicyStatus } from './policy-status.util';
import { FILE_STORAGE, FileStorageAdapter } from '../documents/adapters/file-storage.adapter';
import { PaymentsService } from '../field-collection-wallet/payments.service';
import { Money } from '../../common/utils/money.util';

@Injectable()
export class PoliciesService {
  constructor(
    @InjectRepository(PolicyEntity) private readonly policiesRepo: Repository<PolicyEntity>,
    @InjectRepository(ClientEntity) private readonly clientsRepo: Repository<ClientEntity>,
    @InjectRepository(ProductEntity) private readonly productsRepo: Repository<ProductEntity>,
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
    private readonly eventEmitter: EventEmitter2,
    @Inject(FILE_STORAGE) private readonly storage: FileStorageAdapter,
    private readonly paymentsService: PaymentsService,
    private readonly config: ConfigService,
  ) {}

  async create(dto: CreatePolicyDto): Promise<PolicyEntity> {
    const client = await this.clientsRepo.findOneOrFail({ where: { id: dto.clientId } });
    const product = await this.productsRepo.findOneOrFail({ where: { id: dto.productId } });

    const policy = this.policiesRepo.create({
      policyNo: dto.policyNo,
      client,
      product,
      sumAssured: dto.sumAssured.toFixed(2),
      monthlyPremium: dto.monthlyPremium.toFixed(2),
      commencementDate: dto.commencementDate,
      maturityDate: dto.maturityDate ?? null,
      paymentMethod: dto.paymentMethod,
      status: 'Not Yet Commenced',
      insuredName: dto.insuredName ?? null,
      insuredDob: dto.insuredDob ?? null,
      insuredSex: dto.insuredSex ?? null,
      insuredRelationship: dto.insuredRelationship ?? null,
      insuredSchool: dto.insuredSchool ?? null,
      payrollPinCode: dto.payrollPinCode ?? null,
    });
    const saved = await this.policiesRepo.save(policy);
    this.eventEmitter.emit(DomainEvents.PolicyCreated, { policyId: saved.id });
    return saved;
  }

  async findOne(id: string): Promise<PolicyEntity> {
    const policy = await this.policiesRepo.findOne({ where: { id } });
    if (!policy) throw new NotFoundException('Policy not found');
    return policy;
  }

  /**
   * The canonical per-policy status/arrears computation - originally
   * lived only inside the register controller as a private method, moved
   * here so it has exactly one implementation that Register, Unpaid,
   * Lapse, and now the bulk SMS audience segments (see
   * NotificationsService.resolveAudience) all call, rather than each
   * re-deriving policy status their own way and risking drift between
   * them over time.
   */
  async computedReport(reportingMonth?: string) {
    const rules = {
      premiumDueDay: this.config.get<number>('businessRules.premiumDueDay') ?? 5,
      warningThresholdMonths: this.config.get<number>('businessRules.warningThresholdMonths') ?? 2,
      lapseThresholdMonths: this.config.get<number>('businessRules.lapseThresholdMonths') ?? 3,
    };
    const month = reportingMonth ?? new Date().toISOString().slice(0, 7);

    const policies = await this.findAllWithClientAndProduct();
    const paymentsByPolicy = await this.paymentsService.getPaymentsByMonthForPolicies(policies.map((p) => p.id));
    const results = [];
    for (const policy of policies) {
      const paymentsByMonthMajor = paymentsByPolicy.get(policy.id) ?? {};
      const paymentsByMonth: Record<string, number> = {};
      for (const [m, major] of Object.entries(paymentsByMonthMajor)) {
        paymentsByMonth[m] = Money.fromMajor(major).toMinor();
      }
      const computed = computePolicyStatus(
        {
          commencementMonth: policy.commencementDate.slice(0, 7),
          maturityMonth: policy.maturityDate ? policy.maturityDate.slice(0, 7) : null,
          monthlyPremiumMinor: Money.fromMajor(policy.monthlyPremium).toMinor(),
          paymentsByMonth,
        },
        month,
        rules,
      );
      results.push({
        policyId: policy.id,
        policyNo: policy.policyNo,
        clientId: policy.client.id,
        clientName: policy.client.fullName,
        clientPhone: policy.client.phone,
        clientSmsConsent: policy.client.smsConsent,
        productName: policy.product?.name,
        monthlyPremium: Number(policy.monthlyPremium),
        sumAssured: Number(policy.sumAssured),
        commencementMonth: policy.commencementDate.slice(0, 7),
        maturityMonth: policy.maturityDate ? policy.maturityDate.slice(0, 7) : null,
        status: policy.status === 'Cancelled' ? 'Cancelled' : computed.status,
        totalExpected: Money.fromMinor(computed.totalExpectedMinor).toMajor(),
        totalPaid: Money.fromMinor(computed.totalPaidMinor).toMajor(),
        totalOutstanding: Money.fromMinor(computed.totalOutstandingMinor).toMajor(),
        currentExpected: Money.fromMinor(computed.currentExpectedMinor).toMajor(),
        currentPaid: Money.fromMinor(computed.currentPaidMinor).toMajor(),
        currentOutstanding: Money.fromMinor(computed.currentOutstandingMinor).toMajor(),
        consecutiveUnpaidMonths: computed.consecutiveUnpaidMonths,
        lastPaidMonth: computed.lastPaidMonth,
      });
    }
    return results;
  }

  /** A photo/scan of the physical, signed application form - same pattern as ClientsService.uploadPhoto. */
  async uploadApplicationForm(id: string, buffer: Buffer, originalFilename: string, mimeType: string): Promise<PolicyEntity> {
    const policy = await this.findOne(id);
    if (policy.applicationFormStorageKey) {
      await this.storage.delete(policy.applicationFormStorageKey).catch(() => undefined);
    }
    const stored = await this.storage.save(buffer, originalFilename, mimeType);
    await this.policiesRepo.update(id, { applicationFormStorageKey: stored.storageKey, applicationFormMimeType: mimeType });
    return this.findOne(id);
  }

  async downloadApplicationForm(id: string): Promise<{ buffer: Buffer; mimeType: string }> {
    const policy = await this.findOne(id);
    if (!policy.applicationFormStorageKey) throw new NotFoundException('This policy has no application form on file.');
    const buffer = await this.storage.read(policy.applicationFormStorageKey);
    return { buffer, mimeType: policy.applicationFormMimeType || 'application/octet-stream' };
  }

  /** Same data-correction escape hatch as ClientsService.editFields - a real admin override, not a workflow transition. */
  async editFields(id: string, fields: Record<string, unknown>): Promise<PolicyEntity> {
    const allowed = ['sumAssured', 'monthlyPremium', 'commencementDate', 'maturityDate', 'paymentFrequency', 'paymentMethod', 'status', 'lapseReason', 'insuredName', 'insuredDob', 'payrollPinCode'];
    const update: Record<string, unknown> = {};
    for (const key of allowed) {
      if (fields[key] !== undefined) update[key] = fields[key];
    }
    await this.policiesRepo.update(id, update);
    return this.findOne(id);
  }

  async findByClient(clientId: string): Promise<PolicyEntity[]> {
    return this.policiesRepo.find({ where: { client: { id: clientId } } });
  }

  async countByStatus(): Promise<Record<string, number>> {
    const rows: { status: string; count: string }[] = await this.policiesRepo
      .createQueryBuilder('policy')
      .select('policy.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('policy.status')
      .getRawMany();
    const out: Record<string, number> = {};
    for (const row of rows) out[row.status] = Number(row.count);
    return out;
  }

  async findLapsed(limit = 100): Promise<PolicyEntity[]> {
    return this.policiesRepo.find({
      where: { status: 'Lapsed' },
      relations: ['client'],
      take: limit,
    });
  }

  /** Used only by the nightly lapse-detection job - full book, no pagination. */
  async findAllForStatusRecompute(): Promise<PolicyEntity[]> {
    // Cancelled is deliberately excluded: every other status here is
    // purely a function of dates and payment history, so recomputing it
    // nightly is safe and idempotent. Cancelled is the one status that
    // can never be derived that way (a policy could have a perfectly
    // healthy payment history right up to the point someone cancels
    // it) - if it weren't excluded, this job would silently overwrite
    // it back to whatever the payment history implies on its own.
    return this.policiesRepo.find({ where: { status: Not('Cancelled') } });
  }

  async findAllWithClientAndProduct(): Promise<PolicyEntity[]> {
    return this.policiesRepo.find({ relations: ['client', 'product'] });
  }

  /**
   * Called only by the nightly lapse-detection job (or an on-demand
   * recompute) - never directly from a controller, since status is a
   * derived fact, not something an operator sets by hand.
   */
  async updateStatus(
    policyId: string,
    newStatus: PolicyStatus,
    reportingMonth: string,
  ): Promise<void> {
    const policy = await this.findOne(policyId);
    if (policy.status === newStatus) return;

    const previousStatus = policy.status;
    await this.policiesRepo.update(policyId, { status: newStatus });

    const event: PolicyStatusChangedEvent = {
      policyId,
      previousStatus,
      newStatus,
      reportingMonth,
    };
    this.eventEmitter.emit(DomainEvents.PolicyStatusChanged, event);
  }

  /**
   * "Editable policy number by authorized admin only" - Super Admin role
   * enforced by @Roles() on the controller, `policyNumberLocked` enforced
   * again here, and the change is written in the same transaction as its
   * audit entry so the two can never disagree.
   */
  async editPolicyNumber(
    policyId: string,
    newPolicyNo: string,
    actor: AuthenticatedUser,
  ): Promise<PolicyEntity> {
    const policy = await this.findOne(policyId);
    if (policy.policyNumberLocked) {
      throw new ForbiddenException('This policy number has been locked and can no longer be edited');
    }

    return this.dataSource.transaction(async (manager) => {
      const before = { policyNo: policy.policyNo };
      policy.policyNo = newPolicyNo;
      const saved = await manager.save(PolicyEntity, policy);

      await this.auditService.recordInTransaction(manager, {
        userId: actor.id,
        action: 'policy.number_edited',
        entityType: 'policy',
        entityId: policyId,
        before,
        after: { policyNo: newPolicyNo },
      });

      return saved;
    });
  }

  /**
   * A lapsed policy legally stopped providing cover; simply catching up
   * on premium doesn't restore it on its own in a real insurer - it
   * needs a deliberate, auditable decision by an authorized officer, and
   * the arrears must actually be cleared first (checked here against the
   * live status computation, not the possibly-stale stored status).
   */
  async reinstate(
    policyId: string,
    notes: string,
    actor: AuthenticatedUser,
    rules: { premiumDueDay: number; warningThresholdMonths: number; lapseThresholdMonths: number },
    paymentsByMonth: Record<string, number>,
    reportingMonth: string,
  ): Promise<PolicyEntity> {
    const policy = await this.findOne(policyId);
    if (policy.status === 'Cancelled') {
      throw new ForbiddenException('This policy was cancelled, not lapsed - reinstating it this way is not supported. Contact a Super Admin if this needs to be reversed.');
    }
    const computed = computePolicyStatus(
      {
        commencementMonth: policy.commencementDate.slice(0, 7),
        maturityMonth: policy.maturityDate ? policy.maturityDate.slice(0, 7) : null,
        monthlyPremiumMinor: Math.round(Number(policy.monthlyPremium) * 100),
        paymentsByMonth,
      },
      reportingMonth,
      rules,
    );
    if (computed.status !== 'Lapsed' && computed.totalOutstandingMinor === 0) {
      // Already effectively current - nothing to reinstate, but not an error.
    }
    if (computed.totalOutstandingMinor > 0) {
      throw new ForbiddenException(
        `Cannot reinstate: ${(computed.totalOutstandingMinor / 100).toFixed(2)} in premium arrears must be cleared first.`,
      );
    }

    return this.dataSource.transaction(async (manager) => {
      await manager.update(PolicyEntity, policyId, { status: 'Active', lapseReason: null });
      await this.auditService.recordInTransaction(manager, {
        userId: actor.id,
        action: 'policy.reinstated',
        entityType: 'policy',
        entityId: policyId,
        before: { status: 'Lapsed' },
        after: { status: 'Active', notes },
      });
      return manager.findOneOrFail(PolicyEntity, { where: { id: policyId } });
    });
  }

  /**
   * For fixed-term products (Personal Accident, Credit Life, Group Life)
   * approaching or past their maturity date - distinct from ongoing
   * monthly premium continuity, which never involves a maturity date at
   * all. Renewing just extends coverage forward; it doesn't touch
   * arrears or status, which the live computation handles independently.
   */
  async renew(
    policyId: string,
    newMaturityDate: string,
    notes: string,
    actor: AuthenticatedUser,
  ): Promise<PolicyEntity> {
    const policy = await this.findOne(policyId);
    if (!policy.maturityDate) {
      throw new ForbiddenException('This policy has no maturity date - renewal only applies to fixed-term products.');
    }
    if (newMaturityDate <= policy.maturityDate) {
      throw new ForbiddenException('The new maturity date must be after the current one.');
    }

    return this.dataSource.transaction(async (manager) => {
      const before = { maturityDate: policy.maturityDate };
      await manager.update(PolicyEntity, policyId, { maturityDate: newMaturityDate });
      await this.auditService.recordInTransaction(manager, {
        userId: actor.id,
        action: 'policy.renewed',
        entityType: 'policy',
        entityId: policyId,
        before,
        after: { maturityDate: newMaturityDate, notes },
      });
      return manager.findOneOrFail(PolicyEntity, { where: { id: policyId } });
    });
  }
}
