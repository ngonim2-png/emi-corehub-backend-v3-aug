import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';
import { DecimalTransformer } from '../../../common/utils/decimal.transformer';

/** One rate per marketer - simplest model that fits how microinsurance commission usually works: a flat % of what a marketer personally collects. */
@Entity('commission_rates')
export class CommissionRateEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', unique: true })
  marketerId: string;

  @Column('numeric', { precision: 5, scale: 2, transformer: DecimalTransformer })
  ratePct: string;
}

/** A record that commission for a marketer/period was actually paid out - separate from the computed "earned" figure so paid and outstanding never get confused. */
@Entity('commission_payouts')
export class CommissionPayoutEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  marketerId: string;

  /** 'YYYY-MM' */
  @Column()
  period: string;

  @Column('numeric', { precision: 18, scale: 2, transformer: DecimalTransformer })
  amount: string;

  @Column({ type: 'uuid' })
  paidBy: string;

  @CreateDateColumn()
  paidAt: Date;
}
