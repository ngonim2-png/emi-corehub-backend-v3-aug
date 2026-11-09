import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { ChartOfAccountEntity } from './chart-of-account.entity';
import { DecimalTransformer } from '../../../common/utils/decimal.transformer';

@Entity('journal_entries')
export class JournalEntryEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column()
  entryNo: string;

  @Column({ type: 'date' })
  date: string;

  @Column()
  narration: string;

  /** e.g. 'field-collection-wallet', 'claims', 'manual' */
  @Column()
  sourceModule: string;

  /** id of the payment/claim/etc that caused this entry, for traceability */
  @Column({ type: 'uuid', nullable: true })
  sourceRef: string | null;

  @Column({ type: 'uuid', nullable: true })
  postedBy: string | null;

  /**
   * Manual entries start 'Pending Approval' and only affect the trial
   * balance once a second person approves them (maker-checker). Entries
   * auto-posted from an already-validated business event (a payment, a
   * claim) skip straight to 'Posted' - they're not manually keyed, so
   * there's no data-entry error for a second person to catch.
   */
  @Column({ default: 'Posted' })
  status: 'Posted' | 'Pending Approval';

  @Column({ type: 'uuid', nullable: true })
  approvedBy: string | null;

  @Column({ default: 'None' })
  reversalStatus: 'None' | 'Reversed';

  /** Points from a reversal entry back at the entry it reverses, or is null on the original. */
  @Column({ type: 'uuid', nullable: true })
  reversalOfEntryId: string | null;

  @OneToMany(() => JournalLineEntity, (line) => line.journalEntry, { cascade: true })
  lines: JournalLineEntity[];

  @CreateDateColumn()
  createdAt: Date;
}

@Entity('journal_lines')
export class JournalLineEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => JournalEntryEntity, (entry) => entry.lines, { onDelete: 'CASCADE' })
  journalEntry: JournalEntryEntity;

  @ManyToOne(() => ChartOfAccountEntity)
  account: ChartOfAccountEntity;

  @Column('numeric', { precision: 18, scale: 2, transformer: DecimalTransformer, default: 0 })
  debit: string;

  @Column('numeric', { precision: 18, scale: 2, transformer: DecimalTransformer, default: 0 })
  credit: string;
}
