import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

/** A message/request from a client to the office (change of details, beneficiary change, general question). */
@Entity('app_requests')
export class AppRequestEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  clientId: string;

  @Column({ type: 'varchar', nullable: true })
  policyNo: string | null;

  @Column()
  type: string;

  @Column({ type: 'text' })
  message: string;

  @Column({ default: 'Open' })
  status: string;

  @Column({ type: 'text', nullable: true })
  staffNote: string | null;

  @Column({ type: 'uuid', nullable: true })
  handledBy: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  handledAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
