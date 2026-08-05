import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { v4 as uuid } from 'uuid';
import {
  WalletTransactionEntity,
  WalletTransactionType,
} from './entities/wallet-transaction.entity';
import { Money } from '../../common/utils/money.util';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

export interface WalletBalance {
  marketerId: string;
  allocatedTotal: number;
  usedTotal: number;
  balance: number;
  cashLiability: number;
}

@Injectable()
export class WalletsService {
  constructor(
    @InjectRepository(WalletTransactionEntity)
    private readonly walletTxRepo: Repository<WalletTransactionEntity>,
    private readonly auditService: AuditService,
  ) {}

  async findTransactions(marketerId: string, limit = 100): Promise<WalletTransactionEntity[]> {
    return this.walletTxRepo.find({
      where: { marketerId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  async getBalance(marketerId: string): Promise<WalletBalance> {
    const rows: { type: WalletTransactionType; total: string }[] = await this.walletTxRepo
      .createQueryBuilder('t')
      .select('t.type', 'type')
      .addSelect('COALESCE(SUM(t.amount), 0)', 'total')
      .where('t.marketerId = :marketerId', { marketerId })
      .groupBy('t.type')
      .getRawMany();

    const totals: Record<string, number> = {};
    for (const row of rows) totals[row.type] = Money.fromMajor(row.total).toMinor();

    const allocated = totals['Allocation'] ?? 0;
    const used = totals['CashCollectionPosted'] ?? 0;
    const deposited = totals['DepositConfirmed'] ?? 0;

    return {
      marketerId,
      allocatedTotal: allocated,
      usedTotal: used,
      balance: allocated - used,
      cashLiability: used - deposited,
    };
  }

  /**
   * Finance-role-only allocation (enforced by @Roles on the controller).
   * Writes both the ledger row and its audit entry in one transaction.
   */
  async allocate(marketerId: string, amountMajor: number, actor: AuthenticatedUser): Promise<void> {
    const reference = `ALLOC-${uuid().slice(0, 8).toUpperCase()}`;
    await this.walletTxRepo.manager.transaction(async (manager: EntityManager) => {
      await manager.insert(WalletTransactionEntity, {
        marketerId,
        type: 'Allocation',
        amount: amountMajor.toFixed(2),
        reference,
        approvedBy: actor.id,
      });
      await this.auditService.recordInTransaction(manager, {
        userId: actor.id,
        action: 'wallet.token_allocated',
        entityType: 'marketer_wallet',
        entityId: marketerId,
        before: null,
        after: { amount: amountMajor, reference },
      });
    });
  }

  /** Called inside PaymentsService.postPayment's own transaction. */
  async recordCashCollection(
    manager: EntityManager,
    marketerId: string,
    amountMajor: number,
    reference: string,
  ): Promise<void> {
    await manager.insert(WalletTransactionEntity, {
      marketerId,
      type: 'CashCollectionPosted',
      amount: amountMajor.toFixed(2),
      reference,
      approvedBy: null,
    });
  }

  async confirmDeposit(marketerId: string, amountMajor: number, actor: AuthenticatedUser): Promise<void> {
    const reference = `DEP-${uuid().slice(0, 8).toUpperCase()}`;
    await this.walletTxRepo.manager.transaction(async (manager: EntityManager) => {
      await manager.insert(WalletTransactionEntity, {
        marketerId,
        type: 'DepositConfirmed',
        amount: amountMajor.toFixed(2),
        reference,
        approvedBy: actor.id,
      });
      await this.auditService.recordInTransaction(manager, {
        userId: actor.id,
        action: 'wallet.deposit_confirmed',
        entityType: 'marketer_wallet',
        entityId: marketerId,
        before: null,
        after: { amount: amountMajor, reference },
      });
    });
  }
}
