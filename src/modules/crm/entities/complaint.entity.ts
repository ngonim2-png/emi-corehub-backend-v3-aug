import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn } from 'typeorm';
import { ClientEntity } from '../../clients-policies/entities/client.entity';

@Entity('complaints')
export class ComplaintEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => ClientEntity)
  client: ClientEntity;

  @Column()
  channel: string;

  @Column()
  issue: string;

  @Column({ default: 'Open' })
  status: 'Open' | 'Resolved';

  @CreateDateColumn()
  createdAt: Date;
}

/** Every SMS, call, and interaction logged against a client - CRM's read model for the customer timeline. */
@Entity('crm_interactions')
export class CrmInteractionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => ClientEntity)
  client: ClientEntity;

  @Column()
  channel: string;

  @Column({ type: 'text' })
  summary: string;

  @CreateDateColumn()
  createdAt: Date;
}
