import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProductEntity } from '../clients-policies/entities/product.entity';
import { ClientEntity } from '../clients-policies/entities/client.entity';
import { ClaimEntity } from '../claims/entities/claim.entity';
import { LoanEntity } from '../loans/entities/loan.entity';
import { PoliciesService } from '../clients-policies/policies.service';
import { AppApplicationEntity } from './entities/app-application.entity';
import { AppRequestEntity } from './entities/app-request.entity';
import { ClientAppAccountEntity } from './entities/client-app-account.entity';
import { AppApplicantEntity } from './entities/app-applicant.entity';
import { AppPushService } from './app-push.service';

export type PushSegment = 'all' | 'pendingPremium' | 'lapsed' | 'renewal' | 'selected';

@Injectable()
export class AppAdminService {
  constructor(
    @InjectRepository(ProductEntity) private readonly productsRepo: Repository<ProductEntity>,
    @InjectRepository(ClientEntity) private readonly clientsRepo: Repository<ClientEntity>,
    @InjectRepository(ClaimEntity) private readonly claimsRepo: Repository<ClaimEntity>,
    @InjectRepository(LoanEntity) private readonly loansRepo: Repository<LoanEntity>,
    @InjectRepository(AppApplicationEntity) private readonly appsRepo: Repository<AppApplicationEntity>,
    @InjectRepository(AppRequestEntity) private readonly requestsRepo: Repository<AppRequestEntity>,
    @InjectRepository(ClientAppAccountEntity) private readonly accountsRepo: Repository<ClientAppAccountEntity>,
    @InjectRepository(AppApplicantEntity) private readonly applicantsRepo: Repository<AppApplicantEntity>,
    private readonly policiesService: PoliciesService,
    private readonly push: AppPushService,
  ) {}

  async summary() {
    const [newApplications, openRequests, appClaims, appLoans, activatedClients, applicants, devices] = await Promise.all([
      this.appsRepo.count({ where: [{ status: 'Submitted' }, { status: 'Under Review' }] }),
      this.requestsRepo.count({ where: { status: 'Open' } }),
      this.claimsRepo.count({ where: { source: 'Client App', status: 'Registered' } }),
      this.loansRepo.count({ where: { requestedVia: 'Client App', status: 'Pending Life Manager Approval' } }),
      this.accountsRepo.count(),
      this.applicantsRepo.count(),
      this.push.deviceCounts(),
    ]);
    return { newApplications, openRequests, appClaims, appLoans, activatedClients, applicants, ...devices };
  }

  // ---------------------------------------------------------------- requests

  async listRequests(status?: string) {
    const rows = await this.requestsRepo.find({ where: status ? { status } : {}, order: { createdAt: 'DESC' }, take: 200 });
    const clients = rows.length ? await this.clientsRepo.findByIds(Array.from(new Set(rows.map((r) => r.clientId)))) : [];
    const byId = new Map(clients.map((c) => [c.id, c]));
    return rows.map((r) => ({
      id: r.id, type: r.type, message: r.message, status: r.status, staffNote: r.staffNote, createdAt: r.createdAt, policyNo: r.policyNo,
      clientName: byId.get(r.clientId)?.fullName, clientNo: byId.get(r.clientId)?.clientNo, phone: byId.get(r.clientId)?.phone,
    }));
  }

  async handleRequest(id: string, staffId: string, note: string) {
    const r = await this.requestsRepo.findOne({ where: { id } });
    if (!r) throw new NotFoundException('Request not found.');
    await this.requestsRepo.update(id, { status: 'Handled', staffNote: (note ?? '').trim().slice(0, 500) || null, handledBy: staffId, handledAt: new Date() });
    await this.push.notify('client', r.clientId, 'Update on your request', (note ?? '').trim() ? `Your request "${r.type}" has been handled: ${note.trim().slice(0, 200)}` : `Your request "${r.type}" has been handled by the office.`);
    return { ok: true };
  }

  // ---------------------------------------------------------------- products

  async listProducts() {
    const rows = await this.productsRepo.find({ order: { name: 'ASC' } });
    return rows.map((p) => ({
      id: p.id, code: p.code, name: p.name, category: p.category, minPremium: Number(p.minPremium), maxPremium: Number(p.maxPremium),
      appVisible: p.appVisible, appDescription: p.appDescription, appFormType: p.appFormType,
    }));
  }

  async updateProduct(id: string, body: { appVisible?: boolean; appDescription?: string; appFormType?: string }) {
    const p = await this.productsRepo.findOne({ where: { id } });
    if (!p) throw new NotFoundException('Product not found.');
    const update: Partial<ProductEntity> = {};
    if (typeof body.appVisible === 'boolean') update.appVisible = body.appVisible;
    if (typeof body.appDescription === 'string') update.appDescription = body.appDescription.trim().slice(0, 600) || null;
    if (body.appFormType !== undefined) {
      if (!['standard', 'education'].includes(body.appFormType)) throw new BadRequestException('Form type must be standard or education.');
      update.appFormType = body.appFormType;
    }
    await this.productsRepo.update(id, update);
    return { ok: true };
  }

  // -------------------------------------------------------------------- push

  /** Which clients fall in a segment - the same computed status the Register/Unpaid/Lapse screens use. */
  async segmentMembers(segment: Exclude<PushSegment, 'selected'>, renewalWithinDays = 60) {
    if (segment === 'renewal') {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() + renewalWithinDays);
      const cutoffStr = cutoff.toISOString().slice(0, 10);
      const policies = await this.policiesService.findAllWithClientAndProduct();
      return policies
        .filter((p) => p.maturityDate && p.maturityDate <= cutoffStr)
        .map((p) => ({ clientId: p.client.id, clientName: p.client.fullName, policyNo: p.policyNo, detail: `Matures ${p.maturityDate}` }));
    }
    const rows = await this.policiesService.computedReport();
    const matched = segment === 'all' ? rows
      : segment === 'pendingPremium' ? rows.filter((r) => r.totalOutstanding > 0)
      : rows.filter((r) => r.status === 'Lapsed');
    return matched.map((r) => ({
      clientId: r.clientId, clientName: r.clientName, policyNo: r.policyNo,
      detail: segment === 'pendingPremium' ? `Outstanding: NLe ${r.totalOutstanding.toFixed(2)}` : r.status,
    }));
  }

  /** Preview: how many people match, and how many of them actually have the app set up (so staff know the real reach before sending). */
  async previewSegment(segment: Exclude<PushSegment, 'selected'>) {
    const members = await this.segmentMembers(segment);
    const clientIds = Array.from(new Set(members.map((m) => m.clientId)));
    const activated = new Set((await this.accountsRepo.find()).map((a) => a.clientId));
    return {
      matched: clientIds.length,
      withApp: clientIds.filter((id) => activated.has(id)).length,
      members: members.slice(0, 500).map((m) => ({ ...m, hasApp: activated.has(m.clientId) })),
    };
  }

  async sendBulk(body: { segment: PushSegment; title: string; message: string; clientIds?: string[] }) {
    if (!body.title?.trim() || !body.message?.trim()) throw new BadRequestException('Write a title and a message.');
    let ids: string[];
    if (body.segment === 'selected') {
      ids = Array.from(new Set(body.clientIds ?? []));
    } else {
      const members = await this.segmentMembers(body.segment);
      ids = Array.from(new Set(members.map((m) => m.clientId)));
      if (body.clientIds && body.clientIds.length) {
        const allow = new Set(body.clientIds);
        ids = ids.filter((id) => allow.has(id));
      }
    }
    // Only people who have set up the app can receive an app notification.
    const activated = new Set((await this.accountsRepo.find()).map((a) => a.clientId));
    ids = ids.filter((id) => activated.has(id));
    if (ids.length === 0) throw new BadRequestException('None of those clients have the app set up yet, so there is nobody to notify.');
    if (ids.length > 5000) throw new BadRequestException('Too many recipients in one send (limit 5,000).');
    const r = await this.push.notifyMany('client', ids, body.title.trim().slice(0, 80), body.message.trim().slice(0, 300));
    return { recipients: r.recipients, devicesReached: r.devices };
  }
}
