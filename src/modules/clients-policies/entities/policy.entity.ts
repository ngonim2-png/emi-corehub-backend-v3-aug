import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ClientEntity } from './client.entity';
import { ProductEntity } from './product.entity';
import { DecimalTransformer } from '../../../common/utils/decimal.transformer';

export type PolicyStatus =
  | 'Not Yet Commenced'
  | 'Active'
  | 'One Month Outstanding'
  | 'Warning'
  | 'Lapsed'
  | 'Matured'
  | 'Surrendered'
  | 'Cancelled';

@Entity('policies')
export class PolicyEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column()
  policyNo: string;

  @ManyToOne(() => ClientEntity)
  client: ClientEntity;

  @ManyToOne(() => ProductEntity)
  product: ProductEntity;

  @Column('numeric', { precision: 18, scale: 2, transformer: DecimalTransformer })
  sumAssured: string;

  @Column('numeric', { precision: 18, scale: 2, transformer: DecimalTransformer })
  monthlyPremium: string;

  /** First-of-month, e.g. '2026-01-01' - only the year/month are meaningful. */
  @Column({ type: 'date' })
  commencementDate: string;

  @Column({ type: 'date', nullable: true })
  maturityDate: string | null;

  @Column({ default: 'Monthly' })
  paymentFrequency: string;

  @Column()
  paymentMethod: string;

  @Column({ default: 'Not Yet Commenced' })
  status: PolicyStatus;

  @Column({ type: 'varchar', nullable: true })
  lapseReason: string | null;

  /**
   * "Editable policy number by authorized admin only" (specification 6):
   * enforced here by requiring the Super Admin role in PoliciesController
   * AND by this flag, which a database trigger can additionally check so
   * the rule survives even a bug in the application layer.
   */
  @Column({ default: false })
  policyNumberLocked: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
