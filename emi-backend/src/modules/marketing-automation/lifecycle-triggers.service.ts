import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { LifecycleTriggerEntity, TriggerFireEntity, TriggerType } from './entities/lifecycle-trigger.entity';
import { PolicyEntity } from '../clients-policies/entities/policy.entity';
import { ClientEntity } from '../clients-policies/entities/client.entity';
import { PaymentsService } from '../field-collection-wallet/payments.service';
import { NotificationsService } from '../notifications/notifications.service';
import { computePolicyStatus } from '../clients-policies/policy-status.util';
import { Money } from '../../common/utils/money.util';
import { CreateTriggerDto, UpdateTriggerDto } from './dto/trigger.dto';

@Injectable()
export class LifecycleTriggersService {
  private readonly logger = new Logger(LifecycleTriggersService.name);

  constructor(
    @InjectRepository(LifecycleTriggerEntity) private readonly triggersRepo: Repository<LifecycleTriggerEntity>,
    @InjectRepository(TriggerFireEntity) private readonly firesRepo: Repository<TriggerFireEntity>,
    @InjectRepository(PolicyEntity) private readonly policiesRepo: Repository<PolicyEntity>,
    @InjectRepository(ClientEntity) private readonly clientsRepo: Repository<ClientEntity>,
    private readonly paymentsService: PaymentsService,
    private readonly notificationsService: NotificationsService,
    private readonly config: ConfigService,
  ) {}

  async create(dto: CreateTriggerDto): Promise<LifecycleTriggerEntity> {
    return this.triggersRepo.save(
      this.triggersRepo.create({
        name: dto.name, triggerType: dto.triggerType as TriggerType, messageTemplate: dto.messageTemplate,
        daysOffset: dto.daysOffset ?? null, active: true, channel: 'sms',
      }),
    );
  }

  async findAll(): Promise<LifecycleTriggerEntity[]> {
    return this.triggersRepo.find({ order: { createdAt: 'DESC' } });
  }

  async update(id: string, dto: UpdateTriggerDto): Promise<LifecycleTriggerEntity> {
    await this.triggersRepo.update(id, dto);
    return this.triggersRepo.findOneOrFail({ where: { id } });
  }

  async fireHistory(triggerId?: string): Promise<TriggerFireEntity[]> {
    return this.firesRepo.find({
      where: triggerId ? { triggerId } : {},
      order: { firedAt: 'DESC' },
      take: 200,
    });
  }

  private async alreadyFired(triggerId: string, entityId: string): Promise<boolean> {
    const existing = await this.firesRepo.findOne({ where: { triggerId, entityId } });
    return !!existing;
  }

  private async recordFire(triggerId: string, entityType: 'client' | 'policy', entityId: string): Promise<void> {
    await this.firesRepo.save(this.firesRepo.create({ triggerId, entityType, entityId }));
  }

  private renderTemplate(template: string, vars: Record<string, string>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '');
  }

  private async businessRules() {
    return {
      premiumDueDay: this.config.get<number>('businessRules.premiumDueDay') ?? 5,
      warningThresholdMonths: this.config.get<number>('businessRules.warningThresholdMonths') ?? 2,
      lapseThresholdMonths: this.config.get<number>('businessRules.lapseThresholdMonths') ?? 3,
    };
  }

  /**
   * The engine. Runs through every active trigger, finds candidates for
   * its type, skips anything already fired (via TriggerFireEntity), and
   * queues an SMS for the rest. Called by the nightly job, and also
   * exposed as a manual "run now" endpoint - the fire-log dedupe means
   * running it twice in a row is always safe, never double-sends.
   */
  async runAllTriggers(): Promise<{ triggerId: string; name: string; fired: number }[]> {
    const triggers = await this.triggersRepo.find({ where: { active: true } });
    const results: { triggerId: string; name: string; fired: number }[] = [];
    for (const trigger of triggers) {
      const fired = await this.runOneTrigger(trigger);
      results.push({ triggerId: trigger.id, name: trigger.name, fired });
    }
    return results;
  }

  async runOneTrigger(trigger: LifecycleTriggerEntity): Promise<number> {
    switch (trigger.triggerType) {
      case 'new_client_welcome':
        return this.runNewClientWelcome(trigger);
      case 'policy_warning':
        return this.runPolicyStatusTrigger(trigger, 'Warning');
      case 'policy_lapsed_winback':
        return this.runPolicyStatusTrigger(trigger, 'Lapsed');
      case 'renewal_reminder':
        return this.runRenewalReminder(trigger);
      case 'policy_anniversary':
        return this.runPolicyAnniversary(trigger);
      case 'referral_reward':
        return this.runReferralReward(trigger);
      default:
        return 0;
    }
  }

  /**
   * Automatic sending is gated behind sms.automaticEnabled (see
   * configuration.ts) - off by default. While it's off, every message a
   * trigger would have sent is recorded as Pending instead, so nothing is
   * lost: it shows up in the SMS tab for a person to review and send
   * manually. Once that setting is turned on, these triggers go straight
   * through to actually sending, with no other change needed here.
   */
  private async dispatchSms(input: Parameters<NotificationsService['queueSms']>[0]) {
    if (this.config.get<boolean>('sms.automaticEnabled')) {
      await this.notificationsService.queueSms(input);
    } else {
      await this.notificationsService.logPendingSms(input);
    }
  }

  private async runNewClientWelcome(trigger: LifecycleTriggerEntity): Promise<number> {
    const clients = await this.clientsRepo.find({ where: { smsConsent: true } });
    let fired = 0;
    for (const client of clients) {
      if (await this.alreadyFired(trigger.id, client.id)) continue;
      await this.dispatchSms({
        toPhone: client.phone, relatedType: 'trigger', relatedId: trigger.id,
        templateCode: 'LIFECYCLE_WELCOME',
        body: this.renderTemplate(trigger.messageTemplate, { clientName: client.fullName }),
      });
      await this.recordFire(trigger.id, 'client', client.id);
      fired++;
    }
    return fired;
  }

  private async runPolicyStatusTrigger(trigger: LifecycleTriggerEntity, targetStatus: 'Warning' | 'Lapsed'): Promise<number> {
    const policies = await this.policiesRepo.find({ relations: ['client', 'product'] });
    const rules = await this.businessRules();
    const reportingMonth = new Date().toISOString().slice(0, 7);
    let fired = 0;
    for (const policy of policies) {
      if (!policy.client?.smsConsent) continue;
      if (await this.alreadyFired(trigger.id, policy.id)) continue;
      const paymentsByMonthMajor = await this.paymentsService.getPaymentsByMonthForPolicy(policy.id);
      const paymentsByMonth: Record<string, number> = {};
      for (const [m, major] of Object.entries(paymentsByMonthMajor)) paymentsByMonth[m] = Money.fromMajor(major).toMinor();
      const computed = computePolicyStatus(
        {
          commencementMonth: policy.commencementDate.slice(0, 7),
          maturityMonth: policy.maturityDate ? policy.maturityDate.slice(0, 7) : null,
          monthlyPremiumMinor: Money.fromMajor(policy.monthlyPremium).toMinor(),
          paymentsByMonth,
        },
        reportingMonth,
        rules,
      );
      if (policy.status === 'Cancelled') continue;
      if (computed.status !== targetStatus) continue;
      await this.dispatchSms({
        toPhone: policy.client.phone, relatedType: 'trigger', relatedId: trigger.id,
        templateCode: targetStatus === 'Warning' ? 'LIFECYCLE_WARNING' : 'LIFECYCLE_WINBACK',
        body: this.renderTemplate(trigger.messageTemplate, {
          clientName: policy.client.fullName, policyNo: policy.policyNo,
          outstanding: Money.fromMinor(computed.totalOutstandingMinor).toMajor().toFixed(2),
        }),
      });
      await this.recordFire(trigger.id, 'policy', policy.id);
      fired++;
    }
    return fired;
  }

  private async runRenewalReminder(trigger: LifecycleTriggerEntity): Promise<number> {
    if (!trigger.daysOffset) return 0;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + trigger.daysOffset);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    const policies = await this.policiesRepo.find({ relations: ['client', 'product'] });
    let fired = 0;
    for (const policy of policies) {
      if (!policy.maturityDate || policy.maturityDate > cutoffStr || policy.maturityDate < new Date().toISOString().slice(0, 10)) continue;
      if (!policy.client?.smsConsent) continue;
      if (await this.alreadyFired(trigger.id, policy.id)) continue;
      await this.dispatchSms({
        toPhone: policy.client.phone, relatedType: 'trigger', relatedId: trigger.id,
        templateCode: 'LIFECYCLE_RENEWAL',
        body: this.renderTemplate(trigger.messageTemplate, {
          clientName: policy.client.fullName, policyNo: policy.policyNo, maturityDate: policy.maturityDate,
        }),
      });
      await this.recordFire(trigger.id, 'policy', policy.id);
      fired++;
    }
    return fired;
  }

  private async runPolicyAnniversary(trigger: LifecycleTriggerEntity): Promise<number> {
    const today = new Date();
    const mmdd = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const policies = await this.policiesRepo.find({ relations: ['client'] });
    let fired = 0;
    for (const policy of policies) {
      if (policy.commencementDate.slice(5) !== mmdd) continue;
      if (!policy.client?.smsConsent) continue;
      // Anniversary fires yearly, keyed by (trigger, policy, year) so it isn't a true one-time fire like welcome/warning.
      const yearKey = `${policy.id}-${today.getFullYear()}`;
      if (await this.alreadyFired(trigger.id, yearKey)) continue;
      await this.dispatchSms({
        toPhone: policy.client.phone, relatedType: 'trigger', relatedId: trigger.id,
        templateCode: 'LIFECYCLE_ANNIVERSARY',
        body: this.renderTemplate(trigger.messageTemplate, { clientName: policy.client.fullName, policyNo: policy.policyNo }),
      });
      await this.recordFire(trigger.id, 'policy', yearKey);
      fired++;
    }
    return fired;
  }

  private async runReferralReward(trigger: LifecycleTriggerEntity): Promise<number> {
    const referredActive = await this.clientsRepo.find({ where: { status: 'Active' } });
    let fired = 0;
    for (const referred of referredActive) {
      if (!referred.referredByClientId) continue;
      if (await this.alreadyFired(trigger.id, referred.id)) continue;
      const referrer = await this.clientsRepo.findOne({ where: { id: referred.referredByClientId } });
      if (!referrer?.smsConsent) continue;
      await this.dispatchSms({
        toPhone: referrer.phone, relatedType: 'trigger', relatedId: trigger.id,
        templateCode: 'LIFECYCLE_REFERRAL_REWARD',
        body: this.renderTemplate(trigger.messageTemplate, { referrerName: referrer.fullName, referredName: referred.fullName }),
      });
      await this.recordFire(trigger.id, 'client', referred.id);
      fired++;
    }
    return fired;
  }
}
