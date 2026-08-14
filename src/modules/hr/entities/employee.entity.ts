import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
} from 'typeorm';

@Entity('employees')
export class EmployeeEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  fullName: string;

  @Column()
  department: string;

  @Column()
  jobTitle: string;

  @Column({ type: 'date' })
  hireDate: string;

  @Column({ default: 'Active' })
  status: 'Active' | 'On Leave' | 'Exited';

  /** Links this employee record to a login account, for self-service leave requests. Nullable and auto-populated the first time that user submits their own leave request - not every employee has a login (e.g. labourers), and not every account needs linking up front. */
  @Column({ type: 'uuid', nullable: true, unique: true })
  userId: string | null;

  @CreateDateColumn()
  createdAt: Date;
}

@Entity('leave_requests')
export class LeaveRequestEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => EmployeeEntity)
  employee: EmployeeEntity;

  @Column()
  type: string;

  @Column({ type: 'date' })
  fromDate: string;

  @Column({ type: 'date' })
  toDate: string;

  @Column({ default: 'Pending' })
  status: 'Pending' | 'Approved' | 'Declined';

  @CreateDateColumn()
  createdAt: Date;
}

@Entity('attendance_records')
export class AttendanceEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => EmployeeEntity)
  employee: EmployeeEntity;

  @Column({ type: 'date' })
  date: string;

  @Column({ default: 'Present' })
  status: 'Present' | 'Absent' | 'Late' | 'On Leave';

  @Column({ type: 'timestamptz', nullable: true })
  checkInTime: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
