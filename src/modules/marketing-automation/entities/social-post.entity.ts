import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

/**
 * A planning/tracking tool, not a publishing integration - this system
 * does not post to any platform on your behalf (that needs real OAuth
 * app review with each platform, a business decision, not an
 * engineering default to bake in silently). What this gives you: one
 * place to plan what's going out and when, instead of a spreadsheet.
 */
@Entity('social_posts')
export class SocialPostEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  platform: string;

  @Column('text')
  content: string;

  @Column({ type: 'date' })
  scheduledDate: string;

  @Column({ default: 'Draft' })
  status: 'Draft' | 'Scheduled' | 'Posted';

  @Column({ type: 'uuid' })
  createdBy: string;

  @CreateDateColumn()
  createdAt: Date;
}
