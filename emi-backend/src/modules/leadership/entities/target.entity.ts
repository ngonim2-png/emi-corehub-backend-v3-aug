import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

/**
 * The org-wide target itself - "Increase premium collection by 10%".
 * Who's actually responsible for it lives in TargetAssignmentEntity,
 * since a target can go to multiple people at once, each tracked and
 * scored individually.
 */
@Entity('leadership_targets')
export class TargetEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** The Monday this target was set for. */
  @Column({ type: 'date' })
  weekStartDate: string;

  @Column('text')
  description: string;

  /** Optional link up to the monthly Goal this target is meant to move the needle on. */
  @Column({ type: 'uuid', nullable: true })
  linkedGoalId: string | null;

  /** What "hitting" this target numerically means, if it's a measurable one - e.g. 10 (%), or a currency amount. Free text description above still carries the human-readable version; this is optional structure for the ones worth scoring precisely. */
  @Column({ type: 'numeric', precision: 18, scale: 2, nullable: true })
  targetValue: string | null;

  @Column({ type: 'varchar', nullable: true })
  unit: string | null;

  @Column({ type: 'uuid' })
  createdBy: string;

  @CreateDateColumn()
  createdAt: Date;
}
