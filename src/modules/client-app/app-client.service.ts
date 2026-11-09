import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { ClientEntity } from '../clients-policies/entities/client.entity';
import { PolicyEntity } from '../clients-policies/entities/policy.entity';
import { BeneficiaryEntity } from '../clients-policies/entities/beneficiary.entity';
import { ClaimEntity } from '../claims/entities/claim.entity';
import { LoanEntity } from '../loans/entities/loan.entity';
import { LoanRepaymentEntity } from '../loans/entities/loan-repayment.entity';
import { PaymentEntity } from '../field-collection-wallet/entities/payment.entity';
import { PaymentsService } from '../field-collection-wallet/payments.service';
import { ClaimsService } from '../claims/claims.service';
import { LoansService } from '../loans/loans.service';
import { computePolicyStatus, businessRulesFromConfig, isPayrollDeductionPolicy } from '../clients-policies/policy-status.util';
import { Money } from '../../common/utils/money.util';
import { AppFileEntity } from './entities/app-file.entity';
import { AppRequestEntity } from './entities/app-request.entity';
import { AppPushService } from './app-push.service';
import { normalizePolicyNoForLookup } from './app-auth.service';

export const CLAIM_TYPES = ['Death', 'Maturity', 'Surrender', 'Medical', 'Accident', 'Disability'];
export const REQUEST_TYPES = ['Change of phone or address', 'Change of beneficiary', 'Change of payment method', 'General question', 'Complaint'];
export const MAX_FILE_BYTES = 6 * 1024 * 1024;
export const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

export interface UploadedAppFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/**
 * Everything a logged-in client can see or do. Every method takes the
 * clientId from the verified session token and scopes every query by it -
 * there is deliberately no way to name another client here.
 */
@Injectable()
export class AppClientService {
  constructor(
    @InjectRepository(ClientEntity) private readonly clientsRepo: Repository<ClientEntity>,
    @InjectRepository(PolicyEntity) private readonly policiesRepo: Repository<PolicyEntity>,
    @InjectRepository(BeneficiaryEntity) private readonly beneficiariesRepo: Repository<BeneficiaryEntity>,
    @InjectRepository(ClaimEntity) private readonly claimsRepo: Repository<ClaimEntity>,
    @InjectRepository(LoanEntity) private readonly loansRepo: Repository<LoanEntity>,
    @InjectRepository(LoanRepaymentEntity) private readonly repaymentsRepo: Repository<LoanRepaymentEntity>,
    @InjectRepository(AppFileEntity) private readonly filesRepo: Repository<AppFileEntity>,
    @InjectRepository(AppRequestEntity) private readonly requestsRepo: Repository<AppRequestEntity>,
    private readonly paymentsService: PaymentsService,
    private readonly claimsService: ClaimsService,
    private readonly loansService: LoansService,
    private readonly push: AppPushService,
    private readonly config: ConfigService,
  ) {}

  private rules() {
    return businessRulesFromConfig(this.config);
  }

  /** One policy's computed status, totals and payment list - the same rules the office register uses. */
  async buildPolicyView(policy: PolicyEntity, opts: { paymentLimit?: number } = {}) {
    const all: PaymentEntity[] = await this.paymentsService.findByPolicy(policy.id);
    const real = all.filter((p) => Number(p.amount) > 0 && p.reversalStatus !== 'Reversed');
    const paymentsByMonth: Record<string, number> = {};
    for (const p of real) paymentsByMonth[p.paymentMonth] = (paymentsByMonth[p.paymentMonth] ?? 0) + Money.fromMajor(p.amount).toMinor();
    const reportingMonth = new Date().toISOString().slice(0, 7);
    const computed = computePolicyStatus(
      {
        commencementMonth: policy.commencementDate.slice(0, 7),
        maturityMonth: policy.maturityDate ? policy.maturityDate.slice(0, 7) : null,
        monthlyPremiumMinor: Money.fromMajor(policy.monthlyPremium).toMinor(),
        paymentsByMonth,
        payrollDeduction: isPayrollDeductionPolicy(policy),
      },
      reportingMonth,
      this.rules(),
    );
    const payments = [...real].sort((a, b) => (a.paymentMonth < b.paymentMonth ? 1 : a.paymentMonth > b.paymentMonth ? -1 : 0)).map((p) => ({
      receiptNo: p.receiptNo,
      date: p.createdAt.toISOString().slice(0, 10),
      paymentMonth: p.paymentMonth,
      amount: Number(p.amount),
      method: p.paymentMethod,
    }));
    return {
      policyNo: policy.policyNo,
      productName: policy.product?.name ?? '',
      status: policy.status === 'Cancelled' ? 'Cancelled' : computed.status,
      sumAssured: Number(policy.sumAssured),
      monthlyPremium: Number(policy.monthlyPremium),
      commencementDate: policy.commencementDate,
      maturityDate: policy.maturityDate,
      paymentMethod: policy.paymentMethod,
      payrollPin: policy.payrollPinCode,
      insuredName: policy.insuredName,
      totalExpected: Money.fromMinor(computed.totalExpectedMinor).toMajor(),
      // Everything the client has actually paid - including a first premium paid ahead of the policy start date.
      totalPaid: Money.fromMinor(Object.values(paymentsByMonth).reduce((a, b) => a + b, 0)).toMajor(),
      totalOutstanding: Money.fromMinor(computed.totalOutstandingMinor).toMajor(),
      consecutiveUnpaidMonths: computed.consecutiveUnpaidMonths,
      lastPaidMonth: computed.lastPaidMonth,
      monthsPaid: Object.keys(paymentsByMonth).length,
      payments: opts.paymentLimit ? payments.slice(0, opts.paymentLimit) : payments,
    };
  }

  async overview(clientId: string) {
    const client = await this.clientsRepo.findOne({ where: { id: clientId } });
    if (!client) throw new NotFoundException('Client not found');
    const policies = await this.policiesRepo.find({ where: { client: { id: clientId } }, relations: ['product'], order: { createdAt: 'DESC' } });
    const policyViews = [];
    for (const p of policies) policyViews.push(await this.buildPolicyView(p, { paymentLimit: 6 }));

    const beneficiaries = await this.beneficiariesRepo.find({ where: { client: { id: clientId } } });
    const claims = await this.listClaims(clientId);
    const loans = await this.listLoans(clientId);
    const eligibility = await this.loansService.checkEligibility(clientId);
    return {
      client: {
        fullName: client.fullName, clientNo: client.clientNo, phone: client.phone, altPhone: client.altPhone,
        address: client.address, district: client.district, status: client.status, referralCode: client.referralCode,
      },
      policies: policyViews,
      beneficiaries: beneficiaries.map((b) => ({ name: b.name, relationship: b.relationship, sharePct: Number(b.sharePct), phone: b.phone })),
      claims,
      loans,
      loanEligibility: eligibility,
      unreadNotifications: await this.push.unreadCount('client', clientId),
    };
  }

  private async findOwnPolicy(clientId: string, policyNo: string): Promise<PolicyEntity> {
    const norm = normalizePolicyNoForLookup(policyNo);
    const mine = await this.policiesRepo.find({ where: { client: { id: clientId } }, relations: ['product', 'client'] });
    const found = mine.find((p) => normalizePolicyNoForLookup(p.policyNo) === norm);
    if (!found) throw new NotFoundException('Policy not found.');
    return found;
  }

  async policyDetail(clientId: string, policyNo: string) {
    return this.buildPolicyView(await this.findOwnPolicy(clientId, policyNo));
  }

  async policyForStatement(clientId: string, policyNo: string) {
    const policy = await this.findOwnPolicy(clientId, policyNo);
    return { policy, view: await this.buildPolicyView(policy), client: policy.client };
  }

  // ------------------------------------------------------------------ claims

  async listClaims(clientId: string) {
    const claims = await this.claimsRepo.find({ where: { policy: { client: { id: clientId } } }, relations: ['policy'], order: { createdAt: 'DESC' } });
    const counts = claims.length
      ? await this.filesRepo
          .createQueryBuilder('f')
          .select('f."ownerId"', 'ownerId')
          .addSelect('COUNT(*)', 'n')
          .where("f.\"ownerType\" = 'claim'")
          .andWhere('f."ownerId" IN (:...ids)', { ids: claims.map((c) => c.id) })
          .groupBy('f."ownerId"')
          .getRawMany()
      : [];
    const byClaim = new Map<string, number>(counts.map((r: any) => [r.ownerId, Number(r.n)]));
    return claims.map((c) => ({
      claimNo: c.claimNo, policyNo: c.policy.policyNo, claimType: c.claimType, status: c.status,
      amountClaimed: Number(c.amountClaimed), amountApproved: c.amountApproved ? Number(c.amountApproved) : null,
      dateReported: c.dateReported, datePaid: c.datePaid, description: c.description, source: c.source,
      documents: byClaim.get(c.id) ?? 0,
    }));
  }

  async createClaim(
    clientId: string,
    body: { policyNo: string; claimType: string; description: string; incidentDate?: string; amountClaimed?: number },
    files: UploadedAppFile[],
  ) {
    const policy = await this.findOwnPolicy(clientId, body.policyNo);
    if (!CLAIM_TYPES.includes(body.claimType)) throw new BadRequestException('Please choose a valid claim type.');
    if (!body.description || body.description.trim().length < 10) throw new BadRequestException('Please describe what happened (at least a sentence).');
    if (body.incidentDate && !/^\d{4}-\d{2}-\d{2}$/.test(body.incidentDate)) throw new BadRequestException('Incident date is not valid.');
    const amount = Number(body.amountClaimed ?? 0);
    if (!Number.isFinite(amount) || amount < 0) throw new BadRequestException('Amount is not valid.');
    this.validateFiles(files, 8);

    const claim = await this.claimsService.create(
      { policyId: policy.id, claimType: body.claimType, amountClaimed: amount, dateReported: new Date().toISOString().slice(0, 10) },
      { source: 'Client App', description: body.description.trim(), incidentDate: body.incidentDate || null },
    );
    for (const f of files) {
      await this.filesRepo.save(
        this.filesRepo.create({ ownerType: 'claim', ownerId: claim.id, kind: 'claim_document', filename: f.originalname, mimeType: f.mimetype, sizeBytes: f.size, data: f.buffer }),
      );
    }
    await this.push.notify('client', clientId, 'Claim received', `We have received your ${body.claimType.toLowerCase()} claim (${claim.claimNo}). An officer will review it and contact you.`);
    return { claimNo: claim.claimNo, status: claim.status, documents: files.length };
  }

  validateFiles(files: UploadedAppFile[], max: number) {
    if (files.length > max) throw new BadRequestException(`You can attach at most ${max} files.`);
    for (const f of files) {
      if (!ALLOWED_MIME.includes(f.mimetype)) throw new BadRequestException('Only photos (JPG, PNG) and PDF files can be attached.');
      if (f.size > MAX_FILE_BYTES) throw new BadRequestException('One of your files is too large (limit 6 MB). Please take a smaller photo.');
    }
  }

  // ------------------------------------------------------------------- loans

  async listLoans(clientId: string) {
    const loans = await this.loansRepo.find({ where: { client: { id: clientId } }, order: { requestedAt: 'DESC' } });
    const out = [];
    for (const l of loans) {
      const repayments = l.status === 'Disbursed' || l.status === 'Completed'
        ? await this.repaymentsRepo.find({ where: { loan: { id: l.id } }, order: { dueMonth: 'ASC' } })
        : [];
      out.push({
        id: l.id, loanType: l.loanType, applianceDescription: l.applianceDescription,
        principal: Number(l.principal), tenureMonths: l.tenureMonths, interestRatePct: Number(l.interestRatePct),
        totalInterest: Number(l.totalInterest), totalRepayable: Number(l.totalRepayable), monthlyPayment: Number(l.monthlyPayment),
        status: l.status, requestedAt: l.requestedAt, disbursedAt: l.disbursedAt,
        repayments: repayments.map((r) => ({ dueMonth: r.dueMonth, amountDue: Number(r.amountDue), amountPaid: Number(r.amountPaid), status: r.status })),
      });
    }
    return out;
  }

  async requestLoan(clientId: string, body: { loanType: 'Cash' | 'Appliance'; applianceDescription?: string; principal: number; tenureMonths: number }) {
    const loan = await this.loansService.create(
      { clientId, loanType: body.loanType, applianceDescription: body.applianceDescription, principal: Number(body.principal), tenureMonths: Number(body.tenureMonths) },
      { id: clientId } as any,
      'Client App',
    );
    await this.push.notify('client', clientId, 'Loan request received', 'Your loan request has been received and is waiting for approval. We will notify you of every decision.');
    return { id: loan.id, status: loan.status, monthlyPayment: Number(loan.monthlyPayment), totalRepayable: Number(loan.totalRepayable) };
  }

  // ---------------------------------------------------------------- requests

  async createRequest(clientId: string, body: { type: string; message: string; policyNo?: string }) {
    if (!REQUEST_TYPES.includes(body.type)) throw new BadRequestException('Please choose what your message is about.');
    if (!body.message || body.message.trim().length < 5) throw new BadRequestException('Please write your message.');
    let policyNo: string | null = null;
    if (body.policyNo) policyNo = (await this.findOwnPolicy(clientId, body.policyNo)).policyNo;
    const saved = await this.requestsRepo.save(this.requestsRepo.create({ clientId, policyNo, type: body.type, message: body.message.trim().slice(0, 2000) }));
    return { id: saved.id, status: saved.status };
  }

  async listRequests(clientId: string) {
    const rows = await this.requestsRepo.find({ where: { clientId }, order: { createdAt: 'DESC' }, take: 30 });
    return rows.map((r) => ({ id: r.id, type: r.type, message: r.message, status: r.status, reply: r.staffNote, createdAt: r.createdAt, policyNo: r.policyNo }));
  }
}
