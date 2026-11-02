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

  /** Whether this product is offered to new applicants in the client app. */
  @Column({ default: false })
  appVisible: boolean;

  /** Short plain-language description shown to applicants in the app. */
  @Column({ type: 'text', nullable: true })
  appDescription: string | null;

  /** 'standard' (the person applying is the life assured) or 'education' (a parent insures a child, with school details). */
  @Column({ default: 'standard' })
  appFormType: string;
}
