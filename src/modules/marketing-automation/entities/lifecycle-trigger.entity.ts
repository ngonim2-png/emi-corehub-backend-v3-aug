import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Unique } from 'typeorm';

export type TriggerType =
  | 'new_client_welcome'
  | 'policy_warning'
  | 'policy_lapsed_winback'
  | 'renewal_reminder'
  | 'policy_anniversary'
  | 'referral_reward';

/**
 * A rule, not a message log - "when X happens, send this template."
 * The actual sends are tracked in TriggerFireEntity, one row per
 * (trigger, entity) pair, which is also what prevents the same client
 * getting the same welcome message every night the job runs.
 */
@Entity('lifecycle_triggers')
export class LifecycleTriggerEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column()
  triggerType: TriggerType;

  @Column({ default: 'sms' })
  channel: 'sms';

  /** Supports {{clientName}}, {{policyNo}}, {{daysUntilMaturity}}, {{referrerName}} depending on triggerType - see LifecycleTriggersService.renderTemplate(). */
  @Column('text')
  messageTemplate: string;

  @Column({ default: true })
  active: boolean;

  /** Only meaningful for renewal_reminder - how many days before maturity this specific trigger fires. Three separate trigger rows (30/14/7) give three separate reminders, not one trigger refiring. */
  @Column('int', { nullable: true })
  daysOffset: number | null;

  @CreateDateColumn()
  createdAt: Date;
}

@Entity('trigger_fires')
@Unique(['triggerId', 'entityId'])
export class TriggerFireEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  triggerId: string;

  @Column()
  entityType: 'client' | 'policy';

  @Column({ type: 'uuid' })
  entityId: string;

  @CreateDateColumn()
  firedAt: Date;
}
