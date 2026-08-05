import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MarketerTargetEntity } from './entities/marketer-target.entity';
import { CommissionRateEntity, CommissionPayoutEntity } from './entities/commission.entity';
import { PaymentEntity } from '../field-collection-wallet/entities/payment.entity';

export interface SetTargetInput {
  marketerId: string;
  month: string;
  targetAmount: number;
}

export interface CommissionSummary {
  marketerId: string;
  ratePct: number;
  collected: number;
  earned: number;
  paid: number;
  outstanding: number;
}

@Injectable()
export class MarketingSalesService {
  constructor(
    @InjectRepository(MarketerTargetEntity)
    private readonly targetsRepo: Repository<MarketerTargetEntity>,
    @InjectRepository(CommissionRateEntity)
    private readonly ratesRepo: Repository<CommissionRateEntity>,
    @InjectRepository(CommissionPayoutEntity)
    private readonly payoutsRepo: Repository<CommissionPayoutEntity>,
    @InjectRepository(PaymentEntity)
    private readonly paymentsRepo: Repository<PaymentEntity>,
  ) {}

  async setTarget(input: SetTargetInput): Promise<MarketerTargetEntity> {
    const existing = await this.targetsRepo.findOne({
      where: { marketerId: input.marketerId, month: input.month },
    });
    if (existing) {
      existing.targetAmount = input.targetAmount.toFixed(2);
      return this.targetsRepo.save(existing);
    }
    return this.targetsRepo.save(
      this.targetsRepo.create({
        marketerId: input.marketerId,
        month: input.month,
        targetAmount: input.targetAmount.toFixed(2),
      }),
    );
  }

  async findByMonth(month: string): Promise<MarketerTargetEntity[]> {
    return this.targetsRepo.find({ where: { month } });
  }

  async setCommissionRate(marketerId: string, ratePct: number): Promise<CommissionRateEntity> {
    const existing = await this.ratesRepo.findOne({ where: { marketerId } });
    if (existing) {
      existing.ratePct = ratePct.toFixed(2);
      return this.ratesRepo.save(existing);
    }
    return this.ratesRepo.save(this.ratesRepo.create({ marketerId, ratePct: ratePct.toFixed(2) }));
  }

  async findRates(): Promise<CommissionRateEntity[]> {
    return this.ratesRepo.find();
  }

  /**
   * Earned = what a flat-rate commission on the marketer's own collections
   * for the period works out to. Paid = payouts already recorded. The
   * difference is what finance still owes them - kept as two separate
   * numbers rather than one mutable "balance" for the same reason the
   * wallet balance is computed from a ledger: it stays reconcilable.
   */
  async commissionSummary(period: string): Promise<CommissionSummary[]> {
    const rates = await this.ratesRepo.find();
    const results: CommissionSummary[] = [];
    for (const rate of rates) {
      const collectedRow = await this.paymentsRepo
        .createQueryBuilder('payment')
        .select('COALESCE(SUM(payment.amount), 0)', 'total')
        .where('payment.marketerId = :marketerId', { marketerId: rate.marketerId })
        .andWhere('payment.paymentMonth = :period', { period })
        .getRawOne<{ total: string }>();
      const collected = Number(collectedRow?.total ?? 0);
      const earned = Math.round(collected * (Number(rate.ratePct) / 100) * 100) / 100;

      const paidRow = await this.payoutsRepo
        .createQueryBuilder('payout')
        .select('COALESCE(SUM(payout.amount), 0)', 'total')
        .where('payout.marketerId = :marketerId', { marketerId: rate.marketerId })
        .andWhere('payout.period = :period', { period })
        .getRawOne<{ total: string }>();
      const paid = Number(paidRow?.total ?? 0);

      results.push({
        marketerId: rate.marketerId,
        ratePct: Number(rate.ratePct),
        collected,
        earned,
        paid,
        outstanding: Math.max(earned - paid, 0),
      });
    }
    return results;
  }

  async payCommission(marketerId: string, period: string, amount: number, paidBy: string): Promise<CommissionPayoutEntity> {
    return this.payoutsRepo.save(this.payoutsRepo.create({ marketerId, period, amount: amount.toFixed(2), paidBy }));
  }
}
