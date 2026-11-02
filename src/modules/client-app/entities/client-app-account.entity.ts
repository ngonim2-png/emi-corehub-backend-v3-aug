import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

/** One row per client who has activated the mobile app: policy number + PIN login. */
@Entity('client_app_accounts')
export class ClientAppAccountEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'uuid' })
  clientId: string;

  @Column()
  pinHash: string;

  @Column({ type: 'int', default: 0 })
  failedAttempts: number;

  @Column({ type: 'timestamptz', nullable: true })
  lockedUntil: Date | null;

  /** Bumped on every PIN change/reset so every previously-issued session token stops working. */
  @Column({ type: 'int', default: 0 })
  tokenVersion: number;

  /** 'existing' = a client who was already on the books; 'application' = created from an in-app application (access only opens once their first premium is on file). */
  @Column({ default: 'existing' })
  origin: string;

  @Column({ type: 'timestamptz', nullable: true })
  lastLoginAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
