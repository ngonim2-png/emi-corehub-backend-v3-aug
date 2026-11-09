import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn } from 'typeorm';
import { ChartOfAccountEntity } from './chart-of-account.entity';

@Entity('bank_accounts')
export class BankAccountEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column()
  accountNumber: string;

  /** Which GL account this bank account represents (usually 1000 Cash and Bank). */
  @ManyToOne(() => ChartOfAccountEntity)
  glAccount: ChartOfAccountEntity;

  @CreateDateColumn()
  createdAt: Date;
}

/**
 * One row per line on an imported bank statement. Reconciliation is the
 * act of matching each of these against a journal_lines row on the same
 * GL account - what's left unmatched on either side is exactly what
 * needs investigating (a deposit the bank shows that isn't in the books
 * yet, or a payment the books show that hasn't cleared the bank yet).
 */
@Entity('bank_statement_lines')
export class BankStatementLineEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => BankAccountEntity)
  bankAccount: BankAccountEntity;

  @Column({ type: 'date' })
  date: string;

  @Column()
  description: string;

  /** Positive = money in, negative = money out - matches how a real bank statement reads. */
  @Column('numeric', { precision: 18, scale: 2 })
  amount: string;

  @Column({ default: false })
  matched: boolean;

  @Column({ type: 'uuid', nullable: true })
  matchedJournalLineId: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
