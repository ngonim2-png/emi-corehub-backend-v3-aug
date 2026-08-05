import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

/**
 * users.branchId and clients.branchId have referenced a branch concept
 * since the identity-access and clients-policies modules were first
 * built, but no branches table existed for them to point at - this is
 * that table. Existing branchId values are plain UUIDs (no FK
 * constraint enforced at the DB level, deliberately loose coupling so
 * branch rollout doesn't require backfilling every existing row) - the
 * frontend resolves branchId -> name via this table's list endpoint.
 */
@Entity('branches')
export class BranchEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  district: string;

  @Column({ nullable: true })
  address: string;

  @Column({ nullable: true })
  phone: string;

  @Column({ type: 'uuid', nullable: true })
  managerId: string | null;

  @Column({ default: 'Active' })
  status: 'Active' | 'Inactive';

  @CreateDateColumn()
  createdAt: Date;
}
