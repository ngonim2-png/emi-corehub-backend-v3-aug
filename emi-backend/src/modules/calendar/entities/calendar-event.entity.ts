import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

export type CalendarEventType = 'Meeting' | 'Negotiation' | 'Engagement' | 'Task' | 'Other';
export type CalendarEventStatus = 'Scheduled' | 'Completed' | 'Cancelled' | 'Missed';

/**
 * Meetings, ongoing negotiations, client engagements - anything with a
 * date attached that someone needs to not forget. Deliberately
 * lightweight (no recurrence rules, no external calendar sync) - the
 * point is a shared, visible place to track commitments and have them
 * surface automatically in My Tasks, not to replace a full calendar app.
 */
@Entity('calendar_events')
export class CalendarEventEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @Column({ default: 'Meeting' })
  type: CalendarEventType;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'timestamptz' })
  startAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  endAt: Date | null;

  /** Optional link to what this is about - e.g. relatedType='client', relatedId=client.id */
  @Column({ nullable: true })
  relatedType: string;

  @Column({ type: 'uuid', nullable: true })
  relatedId: string | null;

  @Column({ type: 'uuid' })
  assignedTo: string;

  @Column({ default: 'Scheduled' })
  status: CalendarEventStatus;

  @Column({ type: 'uuid' })
  createdBy: string;

  @CreateDateColumn()
  createdAt: Date;
}
