import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';
import { DecimalTransformer } from '../../../common/utils/decimal.transformer';

@Entity('marketer_targets')
export class MarketerTargetEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  marketerId: string;

  /** 'YYYY-MM' */
  @Column()
  month: string;

  @Column('numeric', { precision: 18, scale: 2, transformer: DecimalTransformer })
  targetAmount: string;
}
