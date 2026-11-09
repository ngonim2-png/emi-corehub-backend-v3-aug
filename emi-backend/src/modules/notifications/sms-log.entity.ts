import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('sms_logs')
export class SmsLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  toPhone: string;

  @Column()
  relatedType: string;

  @Column({ type: 'uuid', nullable: true })
  relatedId: string | null;

  @Column()
  templateCode: string;

  @Column({ type: 'text' })
  body: string;

  @Column({ default: 'Queued' })
  status: 'Pending' | 'Queued' | 'Sent' | 'Delivered' | 'Failed';

  @Column({ type: 'timestamptz', nullable: true })
  sentAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
