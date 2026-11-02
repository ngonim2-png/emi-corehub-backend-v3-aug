import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

/** The in-app inbox. Every push is also stored here so nothing is lost if the phone never received the push. */
@Entity('app_notifications')
export class AppNotificationEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  subjectType: string;

  @Index()
  @Column({ type: 'uuid' })
  subjectId: string;

  @Column()
  title: string;

  @Column({ type: 'text' })
  body: string;

  @Column({ type: 'timestamptz', nullable: true })
  readAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
