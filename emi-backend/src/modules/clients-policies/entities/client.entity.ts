import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export type ClientStatus =
  | 'Active'
  | 'Inactive'
  | 'Lapsed'
  | 'Matured'
  | 'Surrendered'
  | 'Deceased'
  | 'Cancelled';

export type KycStatus = 'Pending' | 'Verified' | 'Rejected';

@Entity('clients')
export class ClientEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column()
  clientNo: string;

  @Column()
  fullName: string;

  @Column({ nullable: true })
  gender: string;

  @Column({ type: 'date', nullable: true })
  dob: string | null;

  @Column({ nullable: true })
  maritalStatus: string;

  @Column({ nullable: true })
  nationality: string;

  /** Distinct from date of birth - both appear separately on the real physical application forms. */
  @Column({ nullable: true })
  placeOfBirth: string;

  @Column()
  phone: string;

  @Column({ nullable: true })
  altPhone: string;

  @Column({ nullable: true })
  nationalId: string;

  @Column({ nullable: true })
  address: string;

  @Column({ nullable: true })
  district: string;

  @Column({ nullable: true })
  chiefdom: string;

  @Column({ nullable: true })
  occupation: string;

  @Column({ nullable: true })
  email: string;

  @Column({ nullable: true })
  employerOrGroup: string;

  @Column({ nullable: true })
  clientCategory: string;

  @Column({ default: 'Pending' })
  kycStatus: KycStatus;

  @Column({ nullable: true })
  riskRating: string;

  @Column({ default: false })
  smsConsent: boolean;

  @Column({ default: 'Active' })
  status: ClientStatus;

  @Column({ type: 'uuid', nullable: true })
  agentId: string | null;

  @Column({ type: 'uuid', nullable: true })
  branchId: string | null;

  /** This client's own code, given out so others can be referred by them. */
  @Index({ unique: true })
  @Column()
  referralCode: string;

  /** Set if this client was themselves brought in by an existing client's referral. */
  @Column({ type: 'uuid', nullable: true })
  referredByClientId: string | null;

  /** Storage key for the client's photo, same FileStorageAdapter as the documents module - null until one is uploaded. */
  @Column({ type: 'varchar', nullable: true })
  photoStorageKey: string | null;

  @Column({ type: 'varchar', nullable: true })
  photoMimeType: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
