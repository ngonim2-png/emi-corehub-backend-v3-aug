import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('leads')
export class LeadEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  phone: string;

  @Column({ nullable: true })
  source: string;

  @Column({ nullable: true })
  district: string;

  @Column({ default: 'New' })
  status: 'New' | 'Contacted' | 'Converted' | 'Lost';

  @Column({ nullable: true })
  notes: string;

  /** Simple, transparent weighted score - see LeadsService.computeScore() for the exact rule. Not a black box. */
  @Column('int', { default: 0 })
  score: number;

  @Column({ type: 'uuid', nullable: true })
  assignedTo: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastActivityAt: Date | null;

  @Column({ type: 'uuid', nullable: true })
  convertedClientId: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
