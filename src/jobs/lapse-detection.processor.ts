import { Processor, WorkerHost } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PoliciesService } from '../modules/clients-policies/policies.service';
import { PaymentsService } from '../modules/field-collection-wallet/payments.service';
import { computePolicyStatus, ym, PolicyForStatusCalc } from '../modules/clients-policies/policy-status.util';
import { Money } from '../common/utils/money.util';

@Processor('jobs')
export class LapseDetectionProcessor extends WorkerHost {
  private readonly logger = new Logger(LapseDetectionProcessor.name);

  constructor(
    private readonly policiesService: PoliciesService,
    private readonly paymentsService: PaymentsService,
    private readonly config: ConfigService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== 'lapse-detection') return;

    const now = new Date();
    const reportingMonth = ym(now.getFullYear(), now.getMonth() + 1);
    const rules = {
      premiumDueDay: this.config.get<number>('businessRules.premiumDueDay') ?? 5,
      warningThresholdMonths: this.config.get<number>('businessRules.warningThresholdMonths') ?? 2,
      lapseThresholdMonths: this.config.get<number>('businessRules.lapseThresholdMonths') ?? 3,
    };

    const policies = await this.policiesService.findAllForStatusRecompute();
    this.logger.log(`Recomputing status for ${policies.length} policies`);

    for (const policy of policies) {
      const paymentsByMonthMajor = await this.paymentsService.getPaymentsByMonthForPolicy(policy.id);
      const paymentsByMonth: Record<string, number> = {};
      for (const [month, majorAmount] of Object.entries(paymentsByMonthMajor)) {
        paymentsByMonth[month] = Money.fromMajor(majorAmount).toMinor();
      }

      const commencementMonth = policy.commencementDate.slice(0, 7);
      const maturityMonth = policy.maturityDate ? policy.maturityDate.slice(0, 7) : null;

      const input: PolicyForStatusCalc = {
        commencementMonth,
        maturityMonth,
        monthlyPremiumMinor: Money.fromMajor(policy.monthlyPremium).toMinor(),
        paymentsByMonth,
      };

      const result = computePolicyStatus(input, reportingMonth, rules, now);
      if (result.status !== policy.status) {
        await this.policiesService.updateStatus(policy.id, result.status, reportingMonth);
      }
    }
  }
}
