import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { ClientEntity } from '../clients-policies/entities/client.entity';
import { PolicyEntity } from '../clients-policies/entities/policy.entity';
import { ClaimEntity } from '../claims/entities/claim.entity';
import { PaymentsService } from '../field-collection-wallet/payments.service';
import { computePolicyStatus } from '../clients-policies/policy-status.util';
import { Money } from '../../common/utils/money.util';

/**
 * Every method here takes clientId as its first argument and every
 * query is scoped by it - there is deliberately no "get all clients"
 * path anywhere in this service, since that's the one mistake that
 * would turn a single-client portal into a data leak.
 */
@Injectable()
export class PortalDataService {
  constructor(
    @InjectRepository(ClientEntity) private readonly clientsRepo: Repository<ClientEntity>,
    @InjectRepository(PolicyEntity) private readonly policiesRepo: Repository<PolicyEntity>,
    @InjectRepository(ClaimEntity) private readonly claimsRepo: Repository<ClaimEntity>,
    private readonly paymentsService: PaymentsService,
    private readonly config: ConfigService,
  ) {}

  async getMyPortalData(clientId: string) {
    const client = await this.clientsRepo.findOne({ where: { id: clientId } });
    if (!client) throw new NotFoundException('Client not found');

    const policies = await this.policiesRepo.find({
      where: { client: { id: clientId } },
      relations: ['product'],
      order: { createdAt: 'DESC' },
    });

    const rules = {
      premiumDueDay: this.config.get<number>('businessRules.premiumDueDay') ?? 5,
      warningThresholdMonths: this.config.get<number>('businessRules.warningThresholdMonths') ?? 2,
      lapseThresholdMonths: this.config.get<number>('businessRules.lapseThresholdMonths') ?? 3,
    };
    const reportingMonth = new Date().toISOString().slice(0, 7);

    const policiesWithStatus = [];
    for (const policy of policies) {
      const payments = await this.paymentsService.findByPolicy(policy.id);
      const paymentsByMonth: Record<string, number> = {};
      payments.forEach((p) => {
        if (Number(p.amount) > 0) {
          paymentsByMonth[p.paymentMonth] = (paymentsByMonth[p.paymentMonth] ?? 0) + Money.fromMajor(p.amount).toMinor();
        }
      });
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
      policiesWithStatus.push({
        policyNo: policy.policyNo,
        productName: policy.product?.name ?? '',
        status: policy.status === 'Cancelled' ? 'Cancelled' : computed.status,
        sumAssured: Number(policy.sumAssured),
        monthlyPremium: Number(policy.monthlyPremium),
        commencementDate: policy.commencementDate,
        maturityDate: policy.maturityDate,
        totalOutstanding: Money.fromMinor(computed.totalOutstandingMinor).toMajor(),
        lastPaidMonth: computed.lastPaidMonth,
        recentPayments: payments.slice(0, 12).map((p) => ({
          receiptNo: p.receiptNo, date: p.createdAt.toISOString().slice(0, 10),
          paymentMonth: p.paymentMonth, amount: Number(p.amount), method: p.paymentMethod,
        })),
      });
    }

    const claims = await this.claimsRepo.find({
      where: { policy: { client: { id: clientId } } },
      relations: ['policy'],
      order: { createdAt: 'DESC' },
    });

    return {
      client: {
        fullName: client.fullName, clientNo: client.clientNo, phone: client.phone,
        district: client.district ?? null, status: client.status,
      },
      policies: policiesWithStatus,
      claims: claims.map((c) => ({
        claimNo: c.claimNo, policyNo: c.policy.policyNo, claimType: c.claimType, status: c.status,
        amountClaimed: Number(c.amountClaimed), amountApproved: c.amountApproved ? Number(c.amountApproved) : null,
        dateReported: c.dateReported, datePaid: c.datePaid,
      })),
    };
  }
}
