import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { PolicyEntity } from '../../clients-policies/entities/policy.entity';
import { DecimalTransformer } from '../../../common/utils/decimal.transformer';

export type PaymentMethod =
  | 'Token Field Collection'
  | 'Mobile Money'
  | 'Bank Transfer'
  | 'Cash Office Payment'
  | 'Payroll Deduction'
  | 'Direct Debit';

@Entity('payments')
export class PaymentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column()
  receiptNo: string;

  @Index({ unique: true })
  @Column()
  transactionId: string;

  @ManyToOne(() => PolicyEntity)
  policy: PolicyEntity;

  @Column('numeric', { precision: 18, scale: 2, transformer: DecimalTransformer })
  amount: string;

  /** 'YYYY-MM' - which month's premium this payment applies to. */
  @Column()
  paymentMonth: string;

  @Column()
  paymentMethod: PaymentMethod;

  @Column({ type: 'uuid', nullable: true })
  marketerId: string | null;

  @Column({ type: 'double precision', nullable: true })
  gpsLat: number | null;

  @Column({ type: 'double precision', nullable: true })
  gpsLng: number | null;

  @Column({ default: 'Pending' })
  smsStatus: string;

  @Column({ default: 'Issued' })
  receiptStatus: string;

  @Column({ default: 'None' })
  reversalStatus: 'None' | 'Reversed';

  @Index()
  @Column({ type: 'uuid', nullable: true })
  reversalOfPaymentId: string | null;

  @Column({ default: 'Unreconciled' })
  reconciliationStatus: string;

  /**
   * The client-supplied Idempotency-Key. A unique constraint here is the
   * database-level backstop for the Redis-based IdempotencyInterceptor -
   * belt and braces, since Redis is a cache, not a system of record.
   */
  @Index({ unique: true })
  @Column()
  idempotencyKey: string;

  @Column({ type: 'uuid' })
  createdBy: string;

  @CreateDateColumn()
  createdAt: Date;
}
