import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { ClientEntity } from './client.entity';

@Entity('beneficiaries')
export class BeneficiaryEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => ClientEntity, { onDelete: 'CASCADE' })
  client: ClientEntity;

  @Column()
  name: string;

  @Column({ nullable: true })
  relationship: string;

  @Column({ type: 'date', nullable: true })
  dateOfBirth: string | null;

  @Column({ nullable: true })
  address: string;

  @Column({ nullable: true })
  phone: string;

  @Column('numeric', { precision: 5, scale: 2, default: 100 })
  sharePct: string;
}
