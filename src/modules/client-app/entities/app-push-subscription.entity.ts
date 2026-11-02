import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('app_push_subscriptions')
export class AppPushSubscriptionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 'client' | 'applicant' */
  @Column()
  subjectType: string;

  @Index()
  @Column({ type: 'uuid' })
  subjectId: string;

  @Index({ unique: true })
  @Column({ type: 'text' })
  endpoint: string;

  @Column({ type: 'text' })
  p256dh: string;

  @Column({ type: 'text' })
  auth: string;

  @CreateDateColumn()
  createdAt: Date;
}
