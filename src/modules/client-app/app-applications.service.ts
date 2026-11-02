import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProductEntity } from '../clients-policies/entities/product.entity';
import { PolicyEntity } from '../clients-policies/entities/policy.entity';
import { ClientEntity } from '../clients-policies/entities/client.entity';
import { PaymentEntity } from '../field-collection-wallet/entities/payment.entity';
import { ClientsService } from '../clients-policies/clients.service';
import { PoliciesService } from '../clients-policies/policies.service';
import { BeneficiariesService } from '../clients-policies/beneficiaries.service';
import { AppApplicationEntity } from './entities/app-application.entity';
import { AppApplicantEntity } from './entities/app-applicant.entity';
import { AppFileEntity } from './entities/app-file.entity';
import { ClientAppAccountEntity } from './entities/client-app-account.entity';
import { AppPushService } from './app-push.service';
import { AppClientService, UploadedAppFile } from './app-client.service';
import { normalizePhone, normalizePolicyNoForLookup } from './app-auth.service';

export interface SubmitApplicationBody {
  productId: string;
  premiumAmount: number;
  durationYears?: number;
  commencementDate?: string;
  isCivilServant?: boolean;
  payrollPin?: string;
  form: Record<string, any>;
}

function clean(v: any, max = 200): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

@Injectable()
export class AppApplicationsService {
  constructor(
    @InjectRepository(AppApplicationEntity) private readonly appsRepo: Repository<AppApplicationEntity>,
    @InjectRepository(AppApplicantEntity) private readonly applicantsRepo: Repository<AppApplicantEntity>,
    @InjectRepository(AppFileEntity) private readonly filesRepo: Repository<AppFileEntity>,
    @InjectRepository(ClientAppAccountEntity) private readonly accountsRepo: Repository<ClientAppAccountEntity>,
    @InjectRepository(ProductEntity) private readonly productsRepo: Repository<ProductEntity>,
    @InjectRepository(PolicyEntity) private readonly policiesRepo: Repository<PolicyEntity>,
    @InjectRepository(ClientEntity) private readonly clientsRepo: Repository<ClientEntity>,
    @InjectRepository(PaymentEntity) private readonly paymentsRepo: Repository<PaymentEntity>,
    private readonly clientsService: ClientsService,
    private readonly policiesService: PoliciesService,
    private readonly beneficiariesService: BeneficiariesService,
    private readonly push: AppPushService,
    private readonly clientApp: AppClientService,
  ) {}

  // ------------------------------------------------------------ public catalogue

  async listProducts() {
    const rows = await this.productsRepo.find({ where: { appVisible: true }, order: { name: 'ASC' } });
    return rows.map((p) => ({
      id: p.id, code: p.code, name: p.name, category: p.category,
      minPremium: Number(p.minPremium), maxPremium: Number(p.maxPremium),
      description: p.appDescription, formType: p.appFormType,
    }));
  }

  // --------------------------------------------------------- applicant actions

  private validateForm(product: ProductEntity, body: SubmitApplicationBody) {
    const f = body.form ?? {};
    const need = (key: string, label: string) => {
      if (!clean(f[key])) throw new BadRequestException(`Please fill in: ${label}.`);
    };
    need('fullName', 'full name');
    need('gender', 'sex');
    need('dob', 'date of birth');
    need('nationality', 'nationality');
    need('address', 'address');
    need('phone', 'mobile number');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(clean(f.dob))) throw new BadRequestException('Date of birth is not valid.');
    if (normalizePhone(clean(f.phone)).length < 8) throw new BadRequestException('Mobile number is not valid.');

    if (!Number.isFinite(Number(body.premiumAmount)) || Number(body.premiumAmount) <= 0) {
      throw new BadRequestException('Please enter the monthly premium you want to pay.');
    }
    if (body.durationYears !== undefined && body.durationYears !== null) {
      const d = Number(body.durationYears);
      if (!Number.isInteger(d) || d < 1 || d > 60) throw new BadRequestException('Plan duration must be between 1 and 60 years.');
    }
    if (body.commencementDate && !/^\d{4}-\d{2}-\d{2}$/.test(body.commencementDate)) {
      throw new BadRequestException('Commencement date is not valid.');
    }
    if (body.isCivilServant) {
      if (!clean(body.payrollPin)) throw new BadRequestException('Civil servants must give their payroll PIN.');
      need('institution', 'ministry / institution');
    }

    if (product.appFormType === 'education') {
      const la = f.lifeAssured ?? {};
      for (const [k, label] of [['name', 'name of the child (life assured)'], ['dob', 'the child’s date of birth'], ['sex', 'the child’s sex'], ['relationship', 'relationship with the policyholder'], ['school', 'the child’s school']] as const) {
        if (!clean(la[k])) throw new BadRequestException(`Please fill in: ${label}.`);
      }
    } else {
      const bens: any[] = Array.isArray(f.beneficiaries) ? f.beneficiaries : [];
      const real = bens.filter((b) => clean(b?.name));
      if (real.length === 0) throw new BadRequestException('Please add at least one beneficiary.');
      for (const b of real) {
        if (!clean(b.relationship)) throw new BadRequestException(`Please give ${clean(b.name)}'s relationship to you.`);
      }
      const total = real.reduce((s, b) => s + Number(b.sharePct ?? 0), 0);
      if (real.length > 1 && Math.abs(total - 100) > 0.5) throw new BadRequestException('Beneficiary shares must add up to 100%.');
    }
  }

  private sanitizeForm(product: ProductEntity, f: Record<string, any>): Record<string, any> {
    const out: Record<string, any> = {
      fullName: clean(f.fullName), gender: clean(f.gender, 20), maritalStatus: clean(f.maritalStatus, 30),
      dob: clean(f.dob, 10), placeOfBirth: clean(f.placeOfBirth), nationality: clean(f.nationality, 60),
      nin: clean(f.nin, 40), address: clean(f.address, 300), district: clean(f.district, 60),
      phone: clean(f.phone, 30), altPhone: clean(f.altPhone, 30), email: clean(f.email, 120),
      occupation: clean(f.occupation, 100), institution: clean(f.institution, 150),
      smsConsent: f.smsConsent !== false,
    };
    if (product.appFormType === 'education') {
      const la = f.lifeAssured ?? {};
      out.lifeAssured = { name: clean(la.name), dob: clean(la.dob, 10), sex: clean(la.sex, 20), relationship: clean(la.relationship, 60), school: clean(la.school, 150) };
    } else {
      const bens: any[] = Array.isArray(f.beneficiaries) ? f.beneficiaries : [];
      out.beneficiaries = bens
        .filter((b) => clean(b?.name))
        .slice(0, 6)
        .map((b, _i, arr) => ({
          name: clean(b.name), relationship: clean(b.relationship, 60), dob: clean(b.dob, 10),
          address: clean(b.address, 300), phone: clean(b.phone, 30),
          sharePct: arr.length === 1 ? 100 : Number(b.sharePct ?? 0),
        }));
    }
    return out;
  }

  private async nextApplicationNo(): Promise<string> {
    const count = await this.appsRepo.count();
    return `APP-${String(count + 1).padStart(5, '0')}`;
  }

  async submit(applicantId: string, body: SubmitApplicationBody, files: { passport?: UploadedAppFile; idDoc?: UploadedAppFile }) {
    const product = await this.productsRepo.findOne({ where: { id: body.productId } });
    if (!product || !product.appVisible) throw new BadRequestException('That plan is not available for online application.');
    this.validateForm(product, body);
    const list = [files.passport, files.idDoc].filter(Boolean) as UploadedAppFile[];
    this.clientApp.validateFiles(list, 2);

    const app = await this.appsRepo.save(
      this.appsRepo.create({
        applicationNo: await this.nextApplicationNo(),
        applicantId,
        productId: product.id,
        productName: product.name,
        formData: this.sanitizeForm(product, body.form),
        premiumAmount: Number(body.premiumAmount).toFixed(2),
        durationYears: body.durationYears ? Number(body.durationYears) : null,
        commencementDate: body.commencementDate || null,
        isCivilServant: !!body.isCivilServant,
        payrollPin: body.isCivilServant ? clean(body.payrollPin, 60) : null,
        status: 'Submitted',
      }),
    );
    if (files.passport) await this.saveFile(app.id, 'passport_photo', files.passport);
    if (files.idDoc) await this.saveFile(app.id, 'id_document', files.idDoc);
    await this.push.notify('applicant', applicantId, 'Application received', `Your ${product.name} application (${app.applicationNo}) has been received. An officer will contact you about your first premium.`);
    return { id: app.id, applicationNo: app.applicationNo, status: app.status };
  }

  private async saveFile(applicationId: string, kind: string, f: UploadedAppFile) {
    await this.filesRepo.save(
      this.filesRepo.create({ ownerType: 'application', ownerId: applicationId, kind, filename: f.originalname, mimeType: f.mimetype, sizeBytes: f.size, data: f.buffer }),
    );
  }

  /** What the applicant is told, in plain language - derived from the record, so it can never disagree with the office's view. */
  private async publicStatus(a: AppApplicationEntity): Promise<{ stage: string; message: string }> {
    if (a.status === 'Rejected') return { stage: 'Not approved', message: a.statusNote || 'Unfortunately we could not approve this application. Please contact the office.' };
    if (a.status === 'Approved') {
      const paid = a.clientId
        ? await this.paymentsRepo.createQueryBuilder('p').innerJoin('p.policy', 'policy')
            .where('policy."clientId" = :cid', { cid: a.clientId }).andWhere("p.\"reversalStatus\" != 'Reversed'").getCount()
        : 0;
      if (paid === 0) return { stage: 'Approved - awaiting first premium', message: `Your application is approved. Your policy number is ${a.policyNo}. An officer will contact you about how to pay your first premium.` };
      return { stage: 'Active', message: `Your policy ${a.policyNo} is active. Log in to the app any time with your policy number and PIN.` };
    }
    if (a.status === 'Under Review') return { stage: 'Under review', message: 'An officer is reviewing your application.' };
    return { stage: 'Received', message: 'We have received your application. An officer will contact you.' };
  }

  async listMine(applicantId: string) {
    const rows = await this.appsRepo.find({ where: { applicantId }, order: { createdAt: 'DESC' } });
    const out = [];
    for (const a of rows) {
      const s = await this.publicStatus(a);
      out.push({ id: a.id, applicationNo: a.applicationNo, productName: a.productName, premiumAmount: Number(a.premiumAmount), submittedAt: a.createdAt, stage: s.stage, message: s.message, policyNo: a.status === 'Approved' ? a.policyNo : null });
    }
    return out;
  }

  // ---------------------------------------------------------------- staff side

  async adminList(status?: string) {
    const where: any = status ? { status } : {};
    const rows = await this.appsRepo.find({ where, order: { createdAt: 'DESC' }, take: 300 });
    const applicants = rows.length ? await this.applicantsRepo.findByIds(Array.from(new Set(rows.map((r) => r.applicantId)))) : [];
    const byId = new Map(applicants.map((a) => [a.id, a]));
    return rows.map((a) => ({
      id: a.id, applicationNo: a.applicationNo, status: a.status, productName: a.productName,
      applicantName: (a.formData as any).fullName || byId.get(a.applicantId)?.fullName, phone: (a.formData as any).phone,
      premiumAmount: Number(a.premiumAmount), isCivilServant: a.isCivilServant, submittedAt: a.createdAt, policyNo: a.policyNo,
    }));
  }

  async adminDetail(id: string) {
    const a = await this.appsRepo.findOne({ where: { id } });
    if (!a) throw new NotFoundException('Application not found.');
    const files = await this.filesRepo
      .createQueryBuilder('f')
      .select(['f.id', 'f.kind', 'f.filename', 'f.mimeType', 'f.sizeBytes'])
      .where("f.\"ownerType\" = 'application' AND f.\"ownerId\" = :id", { id })
      .getMany();
    const product = await this.productsRepo.findOne({ where: { id: a.productId } });
    const applicant = await this.applicantsRepo.findOne({ where: { id: a.applicantId } });
    const suggestedPolicyNo = a.status === 'Approved' ? a.policyNo : await this.suggestPolicyNo(a.productId);
    return {
      ...a,
      premiumAmount: Number(a.premiumAmount),
      files: files.map((f) => ({ id: f.id, kind: f.kind, filename: f.filename, mimeType: f.mimeType, sizeBytes: f.sizeBytes })),
      applicantId: applicant?.id, applicantPhone: applicant?.phone,
      product: product ? { id: product.id, name: product.name, formType: product.appFormType, minPremium: Number(product.minPremium), maxPremium: Number(product.maxPremium) } : null,
      suggestedPolicyNo,
      possibleDuplicates: await this.findDuplicates(a),
    };
  }

  async getFile(fileId: string) {
    const f = await this.filesRepo.findOne({ where: { id: fileId } });
    if (!f) throw new NotFoundException('File not found.');
    return f;
  }

  async listFilesFor(ownerType: string, ownerId: string) {
    const files = await this.filesRepo
      .createQueryBuilder('f')
      .select(['f.id', 'f.kind', 'f.filename', 'f.mimeType', 'f.sizeBytes', 'f.createdAt'])
      .where('f."ownerType" = :ownerType AND f."ownerId" = :ownerId', { ownerType, ownerId })
      .getMany();
    return files.map((f) => ({ id: f.id, kind: f.kind, filename: f.filename, mimeType: f.mimeType, sizeBytes: f.sizeBytes }));
  }

  private async findDuplicates(a: AppApplicationEntity) {
    const f = a.formData as any;
    const phone = normalizePhone(f.phone ?? '');
    const nin = clean(f.nin).toUpperCase();
    const clients = await this.clientsRepo.find();
    return clients
      .filter((c) => (phone.length >= 8 && normalizePhone(c.phone) === phone) || (nin && c.nationalId && c.nationalId.toUpperCase() === nin))
      .slice(0, 5)
      .map((c) => ({ id: c.id, clientNo: c.clientNo, fullName: c.fullName, phone: c.phone }));
  }

  /** Policy numbers follow each product's own pattern (e.g. MPE001, SSP037): find the most-used prefix among that product's policies and continue from the highest number. */
  async suggestPolicyNo(productId: string): Promise<string> {
    const rows = await this.policiesRepo.find({ where: { product: { id: productId } }, select: ['policyNo'] as any });
    const tally = new Map<string, { count: number; max: number; width: number }>();
    for (const r of rows) {
      const m = /^([A-Za-z]+)\s*(\d+)$/.exec((r.policyNo ?? '').trim());
      if (!m) continue;
      const prefix = m[1].toUpperCase();
      const n = Number(m[2]);
      const t = tally.get(prefix) ?? { count: 0, max: 0, width: 0 };
      t.count += 1; t.max = Math.max(t.max, n); t.width = Math.max(t.width, m[2].length);
      tally.set(prefix, t);
    }
    if (tally.size === 0) return '';
    const [prefix, t] = Array.from(tally.entries()).sort((a, b) => b[1].count - a[1].count)[0];
    return `${prefix}${String(t.max + 1).padStart(t.width, '0')}`;
  }

  async markUnderReview(id: string, staffId: string) {
    const a = await this.appsRepo.findOne({ where: { id } });
    if (!a) throw new NotFoundException('Application not found.');
    if (a.status !== 'Submitted') throw new BadRequestException(`This application is already ${a.status}.`);
    await this.appsRepo.update(id, { status: 'Under Review', reviewedBy: staffId, reviewedAt: new Date() });
    await this.push.notify('applicant', a.applicantId, 'Application under review', `Your ${a.productName} application (${a.applicationNo}) is being reviewed.`);
    return this.adminDetail(id);
  }

  async reject(id: string, reason: string, staffId: string) {
    const a = await this.appsRepo.findOne({ where: { id } });
    if (!a) throw new NotFoundException('Application not found.');
    if (a.status === 'Approved') throw new BadRequestException('This application was already approved and converted.');
    if (!reason || reason.trim().length < 3) throw new BadRequestException('Please give a reason the applicant will see.');
    await this.appsRepo.update(id, { status: 'Rejected', statusNote: reason.trim().slice(0, 500), reviewedBy: staffId, reviewedAt: new Date() });
    await this.push.notify('applicant', a.applicantId, 'Application update', `Your ${a.productName} application (${a.applicationNo}) could not be approved: ${reason.trim().slice(0, 200)}`);
    return this.adminDetail(id);
  }

  /**
   * Approves the application: creates the client (or links to an existing
   * one), creates the policy with the number staff assign, adds the
   * beneficiaries, and opens the client-app account using the PIN the
   * person already chose. Their app access opens once the first premium is
   * recorded (see AppAuthService.login).
   */
  async convert(
    id: string,
    staffId: string,
    body: { policyNo: string; sumAssured: number; monthlyPremium: number; commencementDate: string; maturityDate?: string; paymentMethod: string; existingClientId?: string },
  ) {
    const a = await this.appsRepo.findOne({ where: { id } });
    if (!a) throw new NotFoundException('Application not found.');
    if (a.status === 'Approved') throw new BadRequestException('This application was already approved.');
    if (a.status === 'Rejected') throw new BadRequestException('This application was rejected. Ask the applicant to apply again.');

    const policyNo = (body.policyNo ?? '').trim();
    if (!policyNo) throw new BadRequestException('Assign a policy number first.');
    const taken = await this.policiesRepo
      .createQueryBuilder('p')
      .where("REGEXP_REPLACE(UPPER(REGEXP_REPLACE(p.\"policyNo\", '\\s+', '', 'g')), '(\\D)0+(\\d+)$', '\\1\\2') = :n", { n: normalizePolicyNoForLookup(policyNo) })
      .getCount();
    if (taken > 0) throw new ConflictException(`Policy number ${policyNo} is already in use (or matches an existing number once spaces/leading zeros are ignored). Choose another.`);

    const f = a.formData as any;
    const dups = await this.findDuplicates(a);
    if (dups.length > 0 && !body.existingClientId) {
      throw new ConflictException(`DUPLICATE: A client with the same phone or National ID already exists (${dups.map((d) => `${d.clientNo} ${d.fullName}`).join('; ')}). Link this application to that client, or confirm they are different people.`);
    }

    let client: ClientEntity;
    let createdClient = false;
    if (body.existingClientId && body.existingClientId !== 'NEW') {
      client = await this.clientsService.findOne(body.existingClientId);
    } else {
      client = await this.clientsService.create({
        fullName: f.fullName, gender: f.gender || undefined, dob: f.dob || undefined, maritalStatus: f.maritalStatus || undefined,
        nationality: f.nationality || undefined, placeOfBirth: f.placeOfBirth || undefined, phone: f.phone, altPhone: f.altPhone || undefined,
        nationalId: f.nin || undefined, address: f.address || undefined, district: f.district || undefined, occupation: f.occupation || undefined,
        employerOrGroup: f.institution || undefined, email: f.email || undefined,
        clientCategory: a.isCivilServant ? 'Civil Servant' : 'Individual', smsConsent: f.smsConsent !== false,
      } as any);
      createdClient = true;
    }

    let policy: PolicyEntity;
    try {
      const la = f.lifeAssured;
      policy = await this.policiesService.create({
        clientId: client.id, productId: a.productId, policyNo,
        sumAssured: Number(body.sumAssured), monthlyPremium: Number(body.monthlyPremium),
        commencementDate: body.commencementDate, maturityDate: body.maturityDate || undefined,
        paymentMethod: body.paymentMethod,
        insuredName: la?.name || undefined, insuredDob: la?.dob || undefined, insuredSex: la?.sex || undefined,
        insuredRelationship: la?.relationship || undefined, insuredSchool: la?.school || undefined,
        payrollPinCode: a.payrollPin || undefined,
      } as any);
    } catch (e) {
      if (createdClient) await this.clientsRepo.delete(client.id).catch(() => undefined);
      throw e;
    }

    for (const b of (f.beneficiaries ?? []) as any[]) {
      await this.beneficiariesService.create({
        clientId: client.id, name: b.name, relationship: b.relationship || undefined, dateOfBirth: b.dob || undefined,
        address: b.address || undefined, phone: b.phone || undefined, sharePct: Number(b.sharePct ?? 100),
      } as any);
    }

    const applicant = await this.applicantsRepo.findOne({ where: { id: a.applicantId } });
    if (applicant) {
      await this.applicantsRepo.update(applicant.id, { clientId: client.id });
      const existingAcc = await this.accountsRepo.findOne({ where: { clientId: client.id } });
      if (!existingAcc) {
        await this.accountsRepo.save(this.accountsRepo.create({ clientId: client.id, pinHash: applicant.pinHash, origin: 'application' }));
      }
    }

    await this.appsRepo.update(id, { status: 'Approved', clientId: client.id, policyId: policy.id, policyNo: policy.policyNo, reviewedBy: staffId, reviewedAt: new Date(), statusNote: null });
    await this.push.notify('applicant', a.applicantId, 'Application approved', `Good news - your ${a.productName} application is approved. Your policy number is ${policy.policyNo}. An officer will contact you about your first premium.`);
    return { applicationId: id, clientId: client.id, clientNo: client.clientNo, policyId: policy.id, policyNo: policy.policyNo, linkedExistingClient: !createdClient };
  }
}
