import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';
import { DecimalTransformer } from '../../../common/utils/decimal.transformer';

@Entity('cash_reconciliations')
export class CashReconciliationEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  marketerId: string;

  /** 'YYYY-MM' period this reconciliation covers. */
  @Column()
  period: string;

  @Column('numeric', { precision: 18, scale: 2, transformer: DecimalTransformer })
  expectedCash: string;

  @Column('numeric', { precision: 18, scale: 2, transformer: DecimalTransformer })
  depositedCash: string;

  @Column('numeric', { precision: 18, scale: 2, transformer: DecimalTransformer })
  variance: string;

  @Column({ default: 'Open' })
  status: 'Open' | 'Cleared' | 'Flagged';

  @CreateDateColumn()
  createdAt: Date;
}
