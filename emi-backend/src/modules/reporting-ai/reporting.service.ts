import { Inject, Injectable } from '@nestjs/common';
import { PoliciesService } from '../clients-policies/policies.service';
import { ClaimsService } from '../claims/claims.service';
import { JournalService } from '../finance-ifrs17/journal.service';
import { AI_PROVIDER, AiProviderAdapter } from './adapters/ai-provider.adapter';

@Injectable()
export class ReportingService {
  constructor(
    private readonly policiesService: PoliciesService,
    private readonly claimsService: ClaimsService,
    private readonly journalService: JournalService,
    @Inject(AI_PROVIDER) private readonly aiProvider: AiProviderAdapter,
  ) {}

  async dashboardSummary() {
    const statusCounts = await this.policiesService.countByStatus();
    return { statusCounts };
  }

  /**
   * A compiled statutory-style summary - the building blocks a periodic
   * return to the Insurance Commission would draw from. This is NOT a
   * pre-formatted regulatory return (the exact schedule format is a
   * compliance decision, not an engineering one) - it assembles the
   * underlying figures from data that already exists elsewhere in the
   * system into one place, so completing an actual return doesn't mean
   * hunting across a dozen screens.
   */
  async regulatorySummary(period: string) {
    const [year, monthNum] = period.split('-').map(Number);
    const lastDayOfMonth = new Date(year, monthNum, 0).getDate(); // day 0 of next month = last day of this month
    const periodEnd = `${period}-${String(lastDayOfMonth).padStart(2, '0')}`;

    const [statusCounts, claims, trialBalance] = await Promise.all([
      this.policiesService.countByStatus(),
      this.claimsService.findAll(),
      this.journalService.trialBalance(`${period}-01`, periodEnd),
    ]);

    const policiesInForce = Object.entries(statusCounts)
      .filter(([status]) => !['Not Yet Commenced', 'Matured'].includes(status))
      .reduce((sum, [, count]) => sum + count, 0);

    const claimsThisPeriod = claims.filter((c) => c.dateReported.slice(0, 7) === period);
    const claimsPaid = claimsThisPeriod
      .filter((c) => c.status === 'Paid')
      .reduce((sum, c) => sum + Number(c.amountApproved ?? c.amountClaimed), 0);
    const claimsReserved = claims
      .filter((c) => !['Paid', 'Rejected'].includes(c.status))
      .reduce((sum, c) => sum + Number(c.reserveAmount), 0);

    const revenueRow = trialBalance.find((r) => r.code === '4000');
    const premiumIncome = revenueRow ? revenueRow.credit - revenueRow.debit : 0;

    return {
      period,
      policiesInForce,
      statusCounts,
      claimsRegisteredThisPeriod: claimsThisPeriod.length,
      claimsPaidThisPeriod: claimsPaid,
      claimsReservedOutstanding: claimsReserved,
      premiumIncomeThisPeriod: premiumIncome,
      lapseRatio: policiesInForce > 0 ? (statusCounts['Lapsed'] || 0) / policiesInForce : 0,
    };
  }

  /**
   * Builds the bounded summary the AI assistant is allowed to reason
   * over, then asks the configured provider. The assistant never receives
   * a raw table dump, client documents, or anything beyond this summary -
   * see AnthropicAiAdapter for why that matters against prompt injection.
   */
  async ask(question: string): Promise<string> {
    const statusCounts = await this.policiesService.countByStatus();
    const lapsed = await this.policiesService.findLapsed(50);

    const summary = {
      statusCounts,
      lapsedPolicies: lapsed.map((p) => ({
        policyNo: p.policyNo,
        clientName: p.client?.fullName,
        outstanding: p.monthlyPremium,
      })),
    };

    const systemContext =
      'You are the AI assistant inside EMI CoreHub, an insurance management system for ' +
      'Enhanced Mutual Insurance (SL) Ltd. Answer using ONLY this summarised data (JSON): ' +
      `${JSON.stringify(summary)}. Be concise and reference actual figures/names where relevant. ` +
      "If the data doesn't contain the answer, say so plainly.";

    return this.aiProvider.complete(systemContext, question);
  }
}
