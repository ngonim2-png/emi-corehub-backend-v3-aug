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

  /**
   * Who is actually insured under this policy - null means "same as
   * the policyholder" (the common case for self-insured plans). Set
   * explicitly when the policyholder is buying cover on someone else's
   * life, e.g. a parent insuring a child under an education plan: the
   * parent is the Policyholder/Assured, the child is the Life Assured.
   */
  @Column({ type: 'varchar', nullable: true })
  insuredName: string | null;

  @Column({ type: 'date', nullable: true })
  insuredDob: string | null;

  /**
   * The PIN issued by the Accountant General's office for premium
   * deduction straight from a civil servant's government salary.
   * Optional and not tied to any one product - most common on Civil
   * Servant Super Savings, but any product can have a civil-servant
   * client paying this way.
   */
  @Column({ type: 'varchar', nullable: true })
  payrollPinCode: string | null;

  /** External broker who sourced this policy, e.g. "UBS" - not an internal marketer/agent account (that's agentId elsewhere), just a text reference. */
  @Column({ type: 'varchar', nullable: true })
  brokerName: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
