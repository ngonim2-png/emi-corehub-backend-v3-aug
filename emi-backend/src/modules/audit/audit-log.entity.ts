import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

/**
 * Append-only by convention and by database grant: the application's
 * database role should have INSERT and SELECT on this table but never
 * UPDATE or DELETE. No service in this codebase should ever import a
 * repository method other than `create`/`save` (insert) and `find*` for
 * this entity - there is intentionally no updateAuditLog or deleteAuditLog
 * anywhere.
 */
@Entity('audit_logs')
export class AuditLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  userId: string | null;

  @Column()
  action: string;

  @Index()
  @Column()
  entityType: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  entityId: string | null;

  @Column({ type: 'jsonb', nullable: true })
  before: Record<string, any> | null;

  @Column({ type: 'jsonb', nullable: true })
  after: Record<string, any> | null;

  @Column({ type: 'varchar', nullable: true })
  ip: string | null;

  @CreateDateColumn()
  ts: Date;
}
