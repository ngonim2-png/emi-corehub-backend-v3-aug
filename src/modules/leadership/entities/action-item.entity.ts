import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

export type ActionItemStatus = 'Open' | 'Completed';

/**
 * A concrete assignment coming out of a meeting - "Abu to follow up
 * with SLPA by Wednesday". Creating one with a due date automatically
 * creates a linked Calendar event for the assignee (see
 * LeadershipService), so it surfaces in their My Tasks the same way
 * everything else does - one mechanism, not a second competing task
 * list. calendarEventId is what ties the two together, so completing
 * either one can keep the other in sync.
 */
@Entity('leadership_action_items')
export class ActionItemEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true })
  meetingId: string | null;

  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'uuid' })
  assignedTo: string;

  @Column({ type: 'date' })
  dueDate: string;

  @Column({ default: 'Open' })
  status: ActionItemStatus;

  @Column({ type: 'uuid', nullable: true })
  calendarEventId: string | null;

  @Column({ type: 'uuid' })
  createdBy: string;

  @CreateDateColumn()
  createdAt: Date;
}
