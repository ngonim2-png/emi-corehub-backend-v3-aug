import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('assets')
export class AssetEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column()
  category: string;

  @Column({ nullable: true })
  assignedTo: string;

  @Column({ default: 'In Use' })
  status: 'In Use' | 'In Storage' | 'Retired';

  @Column('numeric', { precision: 18, scale: 2, default: 0 })
  purchaseCost: string;

  @Column({ type: 'date', nullable: true })
  purchaseDate: string | null;

  @Column('int', { default: 5 })
  usefulLifeYears: number;

  /** Total depreciation already posted through the monthly batch job - kept as a running total rather than recomputed each time, so a change to usefulLifeYears mid-life doesn't retroactively rewrite history. */
  @Column('numeric', { precision: 18, scale: 2, default: 0 })
  accumulatedDepreciation: string;

  @CreateDateColumn()
  createdAt: Date;
}

@Entity('procurement_requests')
export class ProcurementRequestEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  item: string;

  @Column('int')
  quantity: number;

  @Column('numeric', { precision: 18, scale: 2, default: 0 })
  unitCost: string;

  @Column({ type: 'uuid' })
  requestedBy: string;

  @Column({ default: 'Pending Approval' })
  status: 'Pending Approval' | 'Approved' | 'Rejected';

  /** Set once approval posts the expense journal entry - lets the UI show it's actually hit the books, not just been approved operationally. */
  @Column({ type: 'uuid', nullable: true })
  journalEntryId: string | null;

  /** Approval creates the payable; this is when it was actually settled - the gap between the two is exactly what AP aging measures. */
  @Column({ type: 'timestamptz', nullable: true })
  paidAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}

@Entity('suppliers')
export class SupplierEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  contactPerson: string;

  @Column({ nullable: true })
  phone: string;

  @Column({ nullable: true })
  email: string;

  @Column({ nullable: true })
  category: string;

  @Column({ default: 'Active' })
  status: 'Active' | 'Inactive';

  @CreateDateColumn()
  createdAt: Date;
}
