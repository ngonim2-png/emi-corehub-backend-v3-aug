import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { RoleEntity } from './role.entity';

export type UserStatus = 'Active' | 'Suspended' | 'Disabled';

@Entity('users')
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  fullName: string;

  @Index({ unique: true })
  @Column()
  email: string;

  @Column({ nullable: true })
  phone: string;

  @Column({ select: false })
  passwordHash: string;

  /** TOTP secret, set once MFA enrolment is complete. Never returned by any query by default. */
  @Column({ type: 'varchar', nullable: true, select: false })
  mfaSecret: string | null;

  @Column({ default: false })
  mfaEnabled: boolean;

  @ManyToOne(() => RoleEntity, { eager: true })
  role: RoleEntity;

  @Column({ type: 'uuid', nullable: true })
  branchId: string | null;

  @Column({ default: 'Active' })
  status: UserStatus;

  @Column({ type: 'timestamptz', nullable: true })
  lastLoginAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
