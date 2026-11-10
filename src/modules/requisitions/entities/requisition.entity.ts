import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany, Index } from 'typeorm';

/** A department and the person who signs as its head on requisitions. */
@Entity('departments')
export class DepartmentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column()
  name: string;

  @Column({ type: 'uuid', nullable: true })
  headUserId: string | null;

  @Column({ default: true })
  active: boolean;

  @CreateDateColumn()
  createdAt: Date;
}

export const REQUISITION_STAGES = ['Department Head', 'Procurement Manager', 'Finance Manager', 'Managing Director', 'CEO'] as const;
export type RequisitionStage = (typeof REQUISITION_STAGES)[number];

export type RequisitionStatus =
  | 'Pending Department Head'
  | 'Pending Procurement Manager'
  | 'Pending Finance Manager'
  | 'Pending Managing Director'
  | 'Pending CEO'
  | 'Approved'
  | 'Paid'
  | 'Returned'
  | 'Rejected'
  | 'Cancelled';

@Entity('requisitions')
export class RequisitionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** REQ-YYYY-0001 */
  @Index({ unique: true })
  @Column()
  ref: string;

  @Column({ type: 'text' })
  purpose: string;

  @Column({ type: 'uuid', nullable: true })
  departmentId: string | null;

  @Column()
  departmentName: string;

  @Column({ type: 'uuid' })
  raisedBy: string;

  @Column()
  raisedByName: string;

  /** The raiser's role when they raised it: a step they would sign themselves goes to a stand-in. */
  @Column({ type: 'varchar', nullable: true })
  raisedByRole: string | null;

  /** The raiser's job title, as the paper form asks for a designation. */
  @Column({ type: 'varchar', nullable: true })
  designation: string | null;

  @Column({ type: 'date', nullable: true })
  neededBy: string | null;

  @Column({ default: 'Normal' })
  urgency: 'Normal' | 'Urgent';

  @Column({ type: 'varchar', nullable: true })
  supplier: string | null;

  @Column('numeric', { precision: 14, scale: 2, default: 0 })
  total: string;

  @Column({ default: 'Pending Department Head' })
  status: RequisitionStatus;

  /** The stage that returned or rejected it, so a resubmission can be traced. */
  @Column({ type: 'varchar', nullable: true })
  lastActionStage: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  submittedAt: Date | null;

  // payment, recorded by Finance once the CEO has signed
  @Column({ type: 'date', nullable: true }) paidOn: string | null;
  @Column('numeric', { precision: 14, scale: 2, nullable: true }) amountPaid: string | null;
  @Column({ type: 'varchar', nullable: true }) paymentMethod: string | null;
  @Column({ type: 'varchar', nullable: true }) paymentReference: string | null;
  @Column({ type: 'varchar', nullable: true }) expenseAccount: string | null;
  @Column({ type: 'uuid', nullable: true }) paidBy: string | null;
  @Column({ type: 'uuid', nullable: true }) journalEntryId: string | null;

  // goods received, confirmed by the person who raised it or the Procurement Manager
  @Column({ type: 'timestamptz', nullable: true }) receivedAt: Date | null;
  @Column({ type: 'uuid', nullable: true }) receivedBy: string | null;
  @Column({ type: 'varchar', nullable: true }) receivedByName: string | null;
  @Column({ type: 'text', nullable: true }) receivedNote: string | null;
  /** Asset register entries made when a requisition charged to Fixed Assets was paid. */
  @Column({ type: 'int', default: 0 }) assetsCreated: number;

  @OneToMany(() => RequisitionItemEntity, (i) => i.requisition, { cascade: true })
  items: RequisitionItemEntity[];

  @OneToMany(() => RequisitionApprovalEntity, (a) => a.requisition, { cascade: true })
  approvals: RequisitionApprovalEntity[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

@Entity('requisition_items')
export class RequisitionItemEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => RequisitionEntity, (r) => r.items, { onDelete: 'CASCADE' })
  requisition: RequisitionEntity;

  @Column('int')
  lineNo: number;

  @Column({ type: 'text' })
  description: string;

  @Column('numeric', { precision: 12, scale: 2 })
  quantity: string;

  @Column('numeric', { precision: 14, scale: 2, default: 0 })
  unitCost: string;

  @Column('numeric', { precision: 14, scale: 2, default: 0 })
  totalCost: string;
}

/** One signature on the form: who, in which capacity, what they decided and when. */
@Entity('requisition_approvals')
export class RequisitionApprovalEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => RequisitionEntity, (r) => r.approvals, { onDelete: 'CASCADE' })
  requisition: RequisitionEntity;

  @Column()
  stage: string;

  /** Approved | Returned | Rejected | Submitted | Cancelled | Paid */
  @Column()
  decision: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column()
  userName: string;

  @Column({ type: 'varchar', nullable: true })
  designation: string | null;

  @Column({ type: 'text', nullable: true })
  comment: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  at: Date;
}
