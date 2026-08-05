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

export type ClaimStatus = 'Registered' | 'Under Review' | 'Approved' | 'Paid' | 'Rejected';

@Entity('claims')
export class ClaimEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column()
  claimNo: string;

  @ManyToOne(() => PolicyEntity)
  policy: PolicyEntity;

  @Column()
  claimType: string;

  @Column('numeric', { precision: 18, scale: 2, transformer: DecimalTransformer })
  amountClaimed: string;

  @Column('numeric', { precision: 18, scale: 2, transformer: DecimalTransformer, nullable: true })
  amountApproved: string | null;

  @Column({ type: 'date' })
  dateReported: string;

  @Column({ default: 'Registered' })
  status: ClaimStatus;

  @Column('numeric', { precision: 18, scale: 2, transformer: DecimalTransformer, default: 0 })
  reserveAmount: string;

  /** Set when the claim actually gets paid out - distinct from dateReported, and what monthly regulatory reporting keys off. */
  @Column({ type: 'date', nullable: true })
  datePaid: string | null;

  /** How the payout was actually made - same vocabulary as premium payment methods, but this is a separate field since paying a claim isn't the same event as collecting a premium. */
  @Column({ type: 'varchar', nullable: true })
  paymentMethod: string | null;

  @Column({ type: 'uuid', nullable: true })
  decidedBy: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
