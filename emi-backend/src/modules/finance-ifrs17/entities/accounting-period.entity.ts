import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

/**
 * One row per calendar month. A period starts implicitly open (no row =
 * open) - closing it writes a row here, and every journal-posting path
 * (manual entry, reversal, or an automatic post from a payment/claim
 * event) checks this before writing, so nothing can land in a month the
 * accounting team has already signed off on.
 */
@Entity('accounting_periods')
export class AccountingPeriodEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 'YYYY-MM' */
  @Column({ unique: true })
  period: string;

  @Column({ default: 'Closed' })
  status: 'Closed';

  @Column({ type: 'uuid' })
  closedBy: string;

  @CreateDateColumn()
  closedAt: Date;

  @Column({ nullable: true })
  notes: string;
}
