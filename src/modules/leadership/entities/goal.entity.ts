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
}
