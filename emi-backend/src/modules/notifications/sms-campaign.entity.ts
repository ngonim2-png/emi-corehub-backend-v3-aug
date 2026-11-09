import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

/**
 * One row per bulk send. Individual messages still get their own
 * SmsLogEntity row (linked via relatedType='campaign', relatedId=this
 * campaign's id) - that's deliberate: the SMS Logs view, per-message
 * retry/backoff, and delivery-status tracking all already work correctly
 * for individual sends, and a bulk campaign is "many of those, tracked
 * together" rather than a parallel system that duplicates that logic.
 */
@Entity('sms_campaigns')
export class SmsCampaignEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ type: 'text' })
  message: string;

  @Column()
  audienceType: 'clients' | 'marketers' | 'custom';

  /** What filter produced the audience, kept for the record even though the actual phone list lives on the SmsLogEntity rows. */
  @Column({ type: 'jsonb', nullable: true })
  audienceFilters: Record<string, unknown> | null;

  @Column('int', { default: 0 })
  recipientCount: number;

  @Column('int', { default: 0 })
  sentCount: number;

  @Column('int', { default: 0 })
  failedCount: number;

  @Column({ default: 'Queued' })
  status: 'Queued' | 'Sending' | 'Completed' | 'Failed';

  @Column({ type: 'uuid' })
  createdBy: string;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt: Date | null;
}
