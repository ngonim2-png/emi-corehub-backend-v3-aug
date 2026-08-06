import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { TargetEntity } from './target.entity';

export type TargetAssignmentStatus = 'Set' | 'Achieved' | 'Missed';

/**
 * One person's stake in one target. This is what actually gets scored -
 * a target with three assignees produces three of these, each tracked
 * and reviewed independently, which is what the monthly KPI/appraisal
 * report is built from (achieved assignments / total assignments for
 * that person that month).
 */
@Entity('leadership_target_assignments')
export class TargetAssignmentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => TargetEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'targetId' })
  target: TargetEntity;

  @Column({ type: 'uuid' })
  targetId: string;

  @Column({ type: 'uuid' })
  assignedTo: string;

  @Column({ default: 'Set' })
  status: TargetAssignmentStatus;

  /** What they actually achieved, filled in at Friday review - only meaningful alongside the target's own targetValue/unit. */
  @Column({ type: 'numeric', precision: 18, scale: 2, nullable: true })
  actualValue: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  reviewedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  reviewNotes: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
