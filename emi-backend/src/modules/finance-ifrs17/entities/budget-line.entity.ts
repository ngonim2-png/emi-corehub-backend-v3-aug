import { Entity, PrimaryGeneratedColumn, Column, Unique } from 'typeorm';

/**
 * One row per account per year - annual budgets, compared against the
 * trial balance's actual figures for the same period in
 * budget-vs-actual reporting. Kept deliberately simple (no monthly
 * phasing/spread) since that's a real modeling decision an actual
 * finance team should make, not one to bake in silently here.
 */
@Entity('budget_lines')
@Unique(['accountCode', 'year'])
export class BudgetLineEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  accountCode: string;

  /** 'YYYY' */
  @Column()
  year: string;

  @Column('numeric', { precision: 18, scale: 2 })
  budgetedAmount: string;

  @Column({ type: 'uuid' })
  setBy: string;
}
