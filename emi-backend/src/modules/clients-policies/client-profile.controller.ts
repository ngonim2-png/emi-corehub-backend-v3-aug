import { Controller, Get, Param } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { ClientsService } from './clients.service';
import { PolicyEntity } from './entities/policy.entity';
import { BeneficiariesService } from './beneficiaries.service';
import { PaymentsService } from '../field-collection-wallet/payments.service';
import { ClaimsService } from '../claims/claims.service';
import { UnderwritingService } from '../underwriting/underwriting.service';
import { DocumentsService } from '../documents/documents.service';
import { CrmService } from '../crm/crm.service';
import { computePolicyStatus } from './policy-status.util';
import { Money } from '../../common/utils/money.util';

/**
 * The client 360 view: one call, everything about one client. Built as
 * its own controller rather than folded into ClientsController to keep
 * the fan-out of dependencies (payments, claims, underwriting, documents,
 * CRM) visible and contained in one place - if this file's constructor
 * list keeps growing, that's the signal this needs to become a proper
 * read-model/CQRS projection instead of a live aggregation.
 */
@Controller('clients')
export class ClientProfileController {
  constructor(
    private readonly clientsService: ClientsService,
    private readonly beneficiariesService: BeneficiariesService,
    private readonly paymentsService: PaymentsService,
    private readonly claimsService: ClaimsService,
    private readonly underwritingService: UnderwritingService,
    private readonly documentsService: DocumentsService,
    private readonly crmService: CrmService,
    private readonly config: ConfigService,
    @InjectRepository(PolicyEntity) private readonly policiesRepo: Repository<PolicyEntity>,
  ) {}

  @Get(':id/profile')
  async profile(@Param('id') id: string) {
    const client = await this.clientsService.findOne(id);

    const policies = await this.policiesRepo.find({
      where: { client: { id } },
      relations: ['product'],
    });

    const rules = {
      premiumDueDay: this.config.get<number>('businessRules.premiumDueDay') ?? 5,
      warningThresholdMonths: this.config.get<number>('businessRules.warningThresholdMonths') ?? 2,
      lapseThresholdMonths: this.config.get<number>('businessRules.lapseThresholdMonths') ?? 3,
    };
    const reportingMonth = new Date().toISOString().slice(0, 7);

    const policiesWithStatus = await Promise.all(
      policies.map(async (policy) => {
        const paymentsByMonthMajor = await this.paymentsService.getPaymentsByMonthForPolicy(policy.id);
        const paymentsByMonth: Record<string, number> = {};
        for (const [m, major] of Object.entries(paymentsByMonthMajor)) {
          paymentsByMonth[m] = Money.fromMajor(major).toMinor();
        }
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
        return {
          policyId: policy.id,
          policyNo: policy.policyNo,
          productName: policy.product?.name,
          monthlyPremium: Number(policy.monthlyPremium),
          sumAssured: Number(policy.sumAssured),
          commencementDate: policy.commencementDate,
          maturityDate: policy.maturityDate,
          hasApplicationForm: !!policy.applicationFormStorageKey,
          // Cancelled is never derivable from payment history the way
          // every other status is, so the stored value always wins here
          // - same reasoning as excluding it from the nightly recompute
          // job. Without this, a cancelled policy with no payment
          // history would incorrectly display as Lapsed.
          status: policy.status === 'Cancelled' ? 'Cancelled' : computed.status,
          totalOutstanding: Money.fromMinor(computed.totalOutstandingMinor).toMajor(),
          consecutiveUnpaidMonths: computed.consecutiveUnpaidMonths,
        };
      }),
    );

    const policyIds = policies.map((p) => p.id);
    const paymentsByPolicy = await Promise.all(policyIds.map((pid) => this.paymentsService.findByPolicy(pid)));
    const payments = paymentsByPolicy
      .flat()
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 30)
      .map((p) => ({
        receiptNo: p.receiptNo,
        amount: Number(p.amount),
        paymentMonth: p.paymentMonth,
        paymentMethod: p.paymentMethod,
        createdAt: p.createdAt,
      }));

    const allClaims = await this.claimsService.findAll();
    const claims = allClaims
      .filter((c) => policyIds.includes(c.policy.id))
      .map((c) => ({
        id: c.id,
        claimNo: c.claimNo,
        policyNo: c.policy.policyNo,
        claimType: c.claimType,
        amountClaimed: Number(c.amountClaimed),
        status: c.status,
        dateReported: c.dateReported,
      }));

    const allUnderwriting = await this.underwritingService.findAll();
    const underwriting = allUnderwriting
      .filter((u) => u.client?.id === id)
      .map((u) => ({
        id: u.id,
        productName: u.product?.name,
        sumAssured: Number(u.sumAssured),
        decision: u.decision,
      }));

    const documents = await this.documentsService.findByRelated('client', id);
    const beneficiaries = await this.beneficiariesService.findByClient(id);
    const complaints = await this.crmService.findComplaints();
    const clientComplaints = complaints.filter((c) => c.client?.id === id);
    const interactions = await this.crmService.findInteractions(id);

    const referredBy = client.referredByClientId
      ? await this.clientsService.findOne(client.referredByClientId).catch(() => null)
      : null;
    const referrals = await this.clientsService.findReferrals(id);

    return {
      client,
      policies: policiesWithStatus,
      beneficiaries,
      payments,
      claims,
      underwriting,
      documents,
      complaints: clientComplaints,
      interactions,
      referredBy: referredBy ? { id: referredBy.id, fullName: referredBy.fullName } : null,
      referrals: referrals.map((r) => ({ id: r.id, fullName: r.fullName, status: r.status })),
    };
  }
}
