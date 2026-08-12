import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

export type MeetingType = 'Weekly Planning' | 'Weekly Recap' | 'Monthly Goal Setting';
export type MeetingStatus = 'Scheduled' | 'Completed' | 'Missed';

/**
 * A record of each leadership session - Monday planning, Friday recap,
 * or first-Monday-of-month goal setting. This is a log, not a
 * scheduler: nothing auto-generates these, an admin explicitly starts
 * one (the frontend offers quick "start this week's..." buttons that
 * pre-fill the date/type, but the record only exists once created).
 */
@Entity('leadership_meetings')
export class MeetingEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  type: MeetingType;

  @Column({ type: 'date' })
  date: string;

  /** Optional time of day, 'HH:MM' - when set, a missed check compares against this exact moment rather than just the end of the day. */
  @Column({ type: 'varchar', nullable: true })
  time: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'uuid' })
  conductedBy: string;

  @Column({ default: 'Scheduled' })
  status: MeetingStatus;

  @CreateDateColumn()
  createdAt: Date;
}
