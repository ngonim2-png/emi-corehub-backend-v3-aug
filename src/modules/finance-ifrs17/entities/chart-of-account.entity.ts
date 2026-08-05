import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';

export type AccountType = 'Asset' | 'Liability' | 'Equity' | 'Income' | 'Expense';

@Entity('chart_of_accounts')
export class ChartOfAccountEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  code: string;

  @Column()
  name: string;

  @Column()
  type: AccountType;

  @ManyToOne(() => ChartOfAccountEntity, { nullable: true })
  parent: ChartOfAccountEntity | null;
}
