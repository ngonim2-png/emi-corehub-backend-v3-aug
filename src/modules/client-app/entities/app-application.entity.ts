import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { DecimalTransformer } from '../../../common/utils/decimal.transformer';

export type ApplicationStatus = 'Submitted' | 'Under Review' | 'Approved' | 'Rejected';

@Entity('app_applications')
export class AppApplicationEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column()
  applicationNo: string;

  @Index()
  @Column({ type: 'uuid' })
  applicantId: string;

  @Column({ type: 'uuid' })
  productId: string;

  /** Snapshot of the product name at the time of applying. */
  @Column()
  productName: string;

  /** Everything the applicant filled in (personal details, life assured, beneficiaries...). */
  @Column({ type: 'jsonb' })
  formData: Record<string, any>;

  @Column('numeric', { precision: 18, scale: 2, transformer: DecimalTransformer })
  premiumAmount: string;

  @Column({ type: 'int', nullable: true })
  durationYears: number | null;

  @Column({ type: 'date', nullable: true })
  commencementDate: string | null;

  @Column({ default: false })
  isCivilServant: boolean;

  @Column({ type: 'varchar', nullable: true })
  payrollPin: string | null;

  @Column({ default: 'Submitted' })
  status: ApplicationStatus;

  /** Message the applicant sees (e.g. the reason for a rejection). */
  @Column({ type: 'text', nullable: true })
  statusNote: string | null;

  @Column({ type: 'uuid', nullable: true })
  reviewedBy: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  reviewedAt: Date | null;

  @Column({ type: 'uuid', nullable: true })
  clientId: string | null;

  @Column({ type: 'uuid', nullable: true })
  policyId: string | null;

  @Column({ type: 'varchar', nullable: true })
  policyNo: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
