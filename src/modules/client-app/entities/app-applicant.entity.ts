import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

/** Someone who has signed up in the app to browse products and apply, before they are a client. */
@Entity('app_applicants')
export class AppApplicantEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column()
  phone: string;

  @Column()
  fullName: string;

  @Column()
  pinHash: string;

  @Column({ type: 'int', default: 0 })
  failedAttempts: number;

  @Column({ type: 'timestamptz', nullable: true })
  lockedUntil: Date | null;

  @Column({ type: 'int', default: 0 })
  tokenVersion: number;

  /** Set when an application is approved and the applicant becomes a client. */
  @Column({ type: 'uuid', nullable: true })
  clientId: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
