import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job } from 'bullmq';
import { WalletTransactionEntity } from '../modules/field-collection-wallet/entities/wallet-transaction.entity';

const CASH_LIABILITY_ALERT_DAYS = 3;

@Processor('jobs')
export class WalletReconciliationProcessor extends WorkerHost {
  private readonly logger = new Logger(WalletReconciliationProcessor.name);

  constructor(
    @InjectRepository(WalletTransactionEntity)
    private readonly walletTxRepo: Repository<WalletTransactionEntity>,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== 'wallet-reconciliation') return;

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - CASH_LIABILITY_ALERT_DAYS);

    const rows: { marketerId: string; oldestUnclearedCollection: Date }[] = await this.walletTxRepo
      .createQueryBuilder('t')
      .select('t.marketerId', 'marketerId')
      .addSelect('MIN(t.createdAt)', 'oldestUnclearedCollection')
      .where("t.type = 'CashCollectionPosted'")
      .andWhere(
        `t.marketerId NOT IN (
           SELECT d."marketerId" FROM wallet_transactions d
           WHERE d.type = 'DepositConfirmed' AND d."createdAt" > t."createdAt"
         )`,
      )
      .groupBy('t.marketerId')
      .having('MIN(t.createdAt) < :cutoff', { cutoff })
      .getRawMany();

    if (rows.length > 0) {
      this.logger.warn(
        `${rows.length} marketer(s) have uncleared cash collections older than ${CASH_LIABILITY_ALERT_DAYS} days - ` +
          'this should page the finance on-call in production, not just log.',
      );
    }
  }
}
