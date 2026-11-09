import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

export type GoalStatus = 'Active' | 'Achieved' | 'Missed';

/** Monthly, org-wide - set on the first Monday of the month. The top-level "what are we aiming for" statement that weekly Targets can roll up into. */
@Entity('leadership_goals')
export class GoalEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** YYYY-MM the goal belongs to. */
  @Column()
  month: string;

  @Column('text')
  description: string;

  @Column({ default: 'Active' })
  status: GoalStatus;

  @Column({ type: 'uuid' })
  createdBy: string;

  @CreateDateColumn()
  createdAt: Date;

  /**
   * Computed at read time, never persisted: true when this goal's
   * month has fully ended and it's still sitting as 'Active' - nobody
   * has come back to mark it Achieved or Missed. Deliberately separate
   * from status itself: whether a goal was actually hit is leadership's
   * call to make, not something the system should decide on its own,
   * but leaving that call totally invisible once the month's over
   * isn't right either.
   */
  reviewOverdue?: boolean;
}
