import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn } from 'typeorm';
import { ClientEntity } from '../../clients-policies/entities/client.entity';
import { ProductEntity } from '../../clients-policies/entities/product.entity';
import { DecimalTransformer } from '../../../common/utils/decimal.transformer';

export type UnderwritingDecision = 'Pending' | 'Approved' | 'Declined' | 'Counter-offer';

@Entity('underwriting_cases')
export class UnderwritingCaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => ClientEntity)
  client: ClientEntity;

  @ManyToOne(() => ProductEntity)
  product: ProductEntity;

  @Column('numeric', { precision: 18, scale: 2, transformer: DecimalTransformer })
  sumAssured: string;

  @Column({ type: 'jsonb', nullable: true })
  riskAnswers: Record<string, unknown> | null;

  @Column({ default: 'Pending' })
  decision: UnderwritingDecision;

  @Column({ type: 'varchar', nullable: true })
  decisionReason: string | null;

  @Column({ type: 'uuid', nullable: true })
  decidedBy: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  decidedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
