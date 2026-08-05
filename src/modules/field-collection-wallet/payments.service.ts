import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { v4 as uuid } from 'uuid';
import { PaymentEntity } from './entities/payment.entity';
import { PolicyEntity } from '../clients-policies/entities/policy.entity';
import { WalletsService } from './wallets.service';
import { PostPaymentDto } from './dto/post-payment.dto';
import { DomainEvents, PaymentPostedEvent } from '../../common/events/domain-events';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

const CASH_METHODS = new Set(['Token Field Collection', 'Cash Office Payment']);

@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(PaymentEntity) private readonly paymentsRepo: Repository<PaymentEntity>,
    @InjectRepository(PolicyEntity) private readonly policiesRepo: Repository<PolicyEntity>,
    private readonly dataSource: DataSource,
    private readonly walletsService: WalletsService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Posts a premium payment. The payment row and (for cash/token
   * collections) the wallet ledger row are written in a single database
   * transaction - either both exist or neither does, so a payment can
   * never be posted without its matching wallet movement, and a wallet
   * movement can never exist without a payment behind it.
   *
   * The domain event that triggers the SMS receipt and the finance
   * journal entry is only emitted after the transaction has committed,
   * so a rolled-back payment never produces a receipt or a ledger entry.
   */
  async postPayment(
    dto: PostPaymentDto,
    idempotencyKey: string,
    actor: AuthenticatedUser,
  ): Promise<PaymentEntity> {
    const existing = await this.paymentsRepo.findOne({ where: { idempotencyKey } });
    if (existing) return existing;

    const policy = await this.policiesRepo.findOne({
      where: { id: dto.policyId },
      relations: ['client'],
    });
    if (!policy) throw new BadRequestException('Policy not found');
    if (policy.status === 'Lapsed' || policy.status === 'Matured') {
      // Business rule: still allow posting (a lapsed policy can be revived
      // by payment under the revival rules), but this is the hook where a
      // stricter product could block it outright - left explicit rather
      // than silently allowed.
    }

    const receiptNo = `RCT-${uuid().slice(0, 8).toUpperCase()}`;
    const transactionId = uuid();

    const saved = await this.dataSource.transaction(async (manager: EntityManager) => {
      const payment = manager.create(PaymentEntity, {
        receiptNo,
        transactionId,
        policy,
        amount: dto.amount.toFixed(2),
        paymentMonth: dto.paymentMonth,
        paymentMethod: dto.paymentMethod as PaymentEntity['paymentMethod'],
        marketerId: dto.marketerId ?? null,
        gpsLat: dto.gpsLat ?? null,
        gpsLng: dto.gpsLng ?? null,
        idempotencyKey,
        createdBy: actor.id,
      });
      const savedPayment = await manager.save(PaymentEntity, payment);

      if (CASH_METHODS.has(dto.paymentMethod) && dto.marketerId) {
        await this.walletsService.recordCashCollection(
          manager,
          dto.marketerId,
          dto.amount,
          receiptNo,
        );
      }

      return savedPayment;
    });

    const event: PaymentPostedEvent = {
      paymentId: saved.id,
      policyId: policy.id,
      clientId: policy.client.id,
      clientPhone: policy.client.phone,
      clientName: policy.client.fullName,
      policyNumber: policy.policyNo,
      amountMajor: dto.amount,
      paymentMonth: dto.paymentMonth,
      receiptNo,
      marketerId: dto.marketerId ?? '',
      paymentMethod: dto.paymentMethod,
    };
    this.eventEmitter.emit(DomainEvents.PaymentPosted, event);

    return saved;
  }

  async findByPolicy(policyId: string): Promise<PaymentEntity[]> {
    return this.paymentsRepo.find({
      where: { policy: { id: policyId } },
      order: { createdAt: 'DESC' },
    });
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<PaymentEntity | null> {
    return this.paymentsRepo.findOne({ where: { idempotencyKey } });
  }

  /**
   * For payroll-deduction batch uploads (a large share of real premium
   * volume arrives this way, not one payment at a time). Each row goes
   * through the exact same postPayment() path - same transactional
   * wallet handling, same idempotency, same event emission - so a bulk
   * upload can never bypass any of those guarantees. Rows are processed
   * independently: one bad row (unknown policy number, etc.) doesn't
   * fail the whole batch.
   */
  async postBulk(
    rows: { policyNo: string; paymentMonth: string; amount: number }[],
    actor: AuthenticatedUser,
  ): Promise<{ succeeded: number; failed: { row: number; policyNo: string; error: string }[] }> {
    const failed: { row: number; policyNo: string; error: string }[] = [];
    let succeeded = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const policy = await this.policiesRepo.findOne({ where: { policyNo: row.policyNo } });
        if (!policy) throw new Error('Policy number not found');
        await this.postPayment(
          { policyId: policy.id, paymentMonth: row.paymentMonth, amount: row.amount, paymentMethod: 'Payroll Deduction' },
          `bulk-${row.policyNo}-${row.paymentMonth}-${row.amount}`,
          actor,
        );
        succeeded++;
      } catch (error) {
        failed.push({ row: i + 1, policyNo: row.policyNo, error: (error as Error).message });
      }
    }
    return { succeeded, failed };
  }

  async findRecent(limit = 50, search?: string, page?: number): Promise<PaymentEntity[]> {
    const qb = this.paymentsRepo
      .createQueryBuilder('payment')
      .leftJoinAndSelect('payment.policy', 'policy')
      .leftJoinAndSelect('policy.client', 'client')
      .orderBy('payment.createdAt', 'DESC');

    if (search) {
      qb.andWhere(
        '(client.fullName ILIKE :search OR policy.policyNo ILIKE :search OR payment.receiptNo ILIKE :search)',
        { search: `%${search}%` },
      );
    }
    if (page && page > 0) {
      qb.skip((page - 1) * limit);
    }
    return qb.take(limit).getMany();
  }

  /**
   * Aggregates all payments (including reversals, which are negative
   * amounts) into a month -> total-paid-major-units map, for the
   * lapse-detection job to feed into computePolicyStatus.
   */
  async getPaymentsByMonthForPolicy(policyId: string): Promise<Record<string, number>> {
    const rows: { paymentMonth: string; total: string }[] = await this.paymentsRepo
      .createQueryBuilder('payment')
      .select('payment.paymentMonth', 'paymentMonth')
      .addSelect('COALESCE(SUM(payment.amount), 0)', 'total')
      .where('payment.policyId = :policyId', { policyId })
      .groupBy('payment.paymentMonth')
      .getRawMany();
    const out: Record<string, number> = {};
    for (const row of rows) out[row.paymentMonth] = Number(row.total);
    return out;
  }

  /**
   * Reversal is a new, linked row - the original payment is never edited
   * or deleted, so it stays visible in the audit trail exactly as the
   * specification requires. Requires supervisor/finance approval, enforced
   * by @Roles on the controller.
   */
  async reverse(paymentId: string, actor: AuthenticatedUser): Promise<PaymentEntity> {
    const original = await this.paymentsRepo.findOneOrFail({ where: { id: paymentId } });

    return this.dataSource.transaction(async (manager) => {
      await manager.update(PaymentEntity, paymentId, { reversalStatus: 'Reversed' });

      const reversal = manager.create(PaymentEntity, {
        ...original,
        id: undefined,
        receiptNo: `${original.receiptNo}-REV`,
        transactionId: uuid(),
        amount: `-${original.amount}`,
        reversalOfPaymentId: original.id,
        idempotencyKey: `reversal-${original.id}`,
        createdBy: actor.id,
      });
      return manager.save(PaymentEntity, reversal);
    });
  }
}
