import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('email_logs')
export class EmailLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  toEmail: string;

  @Column()
  subject: string;

  @Column('text')
  body: string;

  @Column({ nullable: true })
  relatedType: string;

  @Column({ type: 'uuid', nullable: true })
  relatedId: string | null;

  @Column({ default: 'Queued' })
  status: 'Queued' | 'Sent' | 'Failed';

  @Column({ nullable: true })
  providerMessageId: string;

  @CreateDateColumn()
  createdAt: Date;
}
