import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';
import { DecimalTransformer } from '../../../common/utils/decimal.transformer';

export type WalletTransactionType = 'Allocation' | 'CashCollectionPosted' | 'DepositConfirmed';

/**
 * Deliberately has no companion "marketer_wallets.balance" mutable column.
 * A wallet's allocated/used/cash-liability figures are always computed by
 * WalletsService from SUM()s over this table - see the architecture doc,
 * "Payment and wallet integrity". This is what makes tampering detectable:
 * editing a row here breaks the ledger arithmetic instead of quietly
 * updating a balance nobody can independently verify.
 */
@Entity('wallet_transactions')
export class WalletTransactionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  marketerId: string;

  @Column()
  type: WalletTransactionType;

  @Column('numeric', { precision: 18, scale: 2, transformer: DecimalTransformer })
  amount: string;

  @Column()
  reference: string;

  @Column({ type: 'uuid', nullable: true })
  approvedBy: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
