import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

export type RosterIssueStatus = 'Pending' | 'Resolved' | 'Dismissed';

/**
 * A row from a bulk roster import (e.g. the Pay Smol Smol master list)
 * that couldn't be safely turned into a real Client + Policy on its
 * own - missing policy number, a policy number or pincode that
 * collides with another row, an unparseable date, etc. Held here,
 * untouched, until a staff member reviews and resolves it. Nothing in
 * this table is a real client or policy; resolving one is what
 * actually creates those records, at which point resolvedPolicyId
 * links back to the real thing.
 *
 * Deliberately product-agnostic - the same review queue serves any
 * future bulk roster import, not just Pay Smol Smol. Only the parser
 * that produces these rows is specific to a given office file's layout.
 */
@Entity('roster_import_issues')
export class RosterImportIssueEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  productId: string;

  @Column({ type: 'jsonb' })
  rawData: Record<string, any>;

  @Column({ type: 'jsonb' })
  issueTypes: string[];

  @Column({ type: 'text' })
  issueDetails: string;

  @Column({ default: 'Pending' })
  status: RosterIssueStatus;

  @Column({ type: 'uuid', nullable: true })
  resolvedPolicyId: string | null;

  @Column({ type: 'uuid', nullable: true })
  resolvedBy: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;

  @Column({ type: 'varchar', nullable: true })
  sourceFileName: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
