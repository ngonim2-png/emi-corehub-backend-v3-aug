import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn } from 'typeorm';
import { BankAccountEntity } from './bank-account.entity';

export type BankAccountDeletionStatus = 'Pending' | 'Approved' | 'Rejected';

/**
 * A Finance Manager can't delete a bank account directly - this is the
 * request that sits pending until a Supreme Admin decides it. Supreme
 * Admin requesting their own deletion skips this entirely (see
 * requestBankAccountDeletion in financial-reports.service.ts) - there's
 * no one else to approve their own request against, so making them
 * wait on themselves would be pure friction, not a real safeguard.
 */
@Entity('bank_account_deletion_requests')
export class BankAccountDeletionRequestEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => BankAccountEntity, { nullable: true, onDelete: 'SET NULL' })
  bankAccount: BankAccountEntity | null;

  /** Kept even after the bank account itself is deleted, so the request's own history stays readable. */
  @Column()
  bankAccountName: string;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column({ default: 'Pending' })
  status: BankAccountDeletionStatus;

  @Column({ type: 'uuid' })
  requestedBy: string;

  @CreateDateColumn()
  requestedAt: Date;

  @Column({ type: 'uuid', nullable: true })
  decidedBy: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  decidedAt: Date | null;
}
