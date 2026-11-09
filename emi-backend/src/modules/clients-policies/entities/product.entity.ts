import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';
import { DecimalTransformer } from '../../../common/utils/decimal.transformer';

@Entity('products')
export class ProductEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  code: string;

  @Column()
  name: string;

  @Column()
  category: string;

  @Column('numeric', { precision: 18, scale: 2, transformer: DecimalTransformer })
  minPremium: string;

  @Column('numeric', { precision: 18, scale: 2, transformer: DecimalTransformer })
  maxPremium: string;
}
