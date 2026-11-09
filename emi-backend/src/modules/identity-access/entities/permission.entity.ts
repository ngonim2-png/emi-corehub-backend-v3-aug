import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

/**
 * Fine-grained permission catalogue (e.g. "payment.reverse",
 * "journal.post"). The prototype and Phase 1 use role-based checks only
 * (@Roles(...)); this table is the extension point for per-permission
 * checks once the role list grows past what a fixed enum can express
 * cleanly.
 */
@Entity('permissions')
export class PermissionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  code: string;

  @Column({ nullable: true })
  description: string;
}
