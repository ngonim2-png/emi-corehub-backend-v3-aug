import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

/** One-time activation / PIN-reset codes, sent by SMS or issued by staff. Only a hash is stored. */
@Entity('app_verification_codes')
export class AppVerificationCodeEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  clientId: string;

  @Column()
  codeHash: string;

  /** 'sms' or 'staff' */
  @Column()
  source: string;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'int', default: 0 })
  attempts: number;

  @Column({ type: 'timestamptz', nullable: true })
  usedAt: Date | null;

  @Column({ type: 'uuid', nullable: true })
  createdBy: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
