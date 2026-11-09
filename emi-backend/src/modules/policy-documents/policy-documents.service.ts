import { Inject, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { PolicyDocumentTemplateEntity } from './entities/policy-document-template.entity';
import { PolicyEntity } from '../clients-policies/entities/policy.entity';
import { BeneficiariesService } from '../clients-policies/beneficiaries.service';
import { FILE_STORAGE, FileStorageAdapter } from '../documents/adapters/file-storage.adapter';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

function fmtMoney(n: string | number): string {
  return 'NLe ' + Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}
const NUMBER_WORDS = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven'];
function spellNumber(n: number): string {
  return NUMBER_WORDS[n] ?? String(n);
}
/** "Three (3) Years" style wording, computed from the two dates actually on file rather than stored separately - so it can never drift out of sync with them. */
function formatPolicyPeriod(commencementDate: string, maturityDate: string | null): string {
  if (!maturityDate) return '—';
  const start = new Date(commencementDate);
  const end = new Date(maturityDate);
  let months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  if (end.getDate() < start.getDate()) months -= 1;
  if (months <= 0) return '—';
  const years = Math.floor(months / 12);
  const remMonths = months % 12;
  const parts: string[] = [];
  if (years > 0) parts.push(`${spellNumber(years)} (${years}) Year${years === 1 ? '' : 's'}`);
  if (remMonths > 0) parts.push(`${spellNumber(remMonths)} (${remMonths}) Month${remMonths === 1 ? '' : 's'}`);
  return parts.join(', ') || '—';
}

@Injectable()
export class PolicyDocumentsService {
  constructor(
    @InjectRepository(PolicyDocumentTemplateEntity) private readonly templatesRepo: Repository<PolicyDocumentTemplateEntity>,
    @InjectRepository(PolicyEntity) private readonly policiesRepo: Repository<PolicyEntity>,
    private readonly beneficiariesService: BeneficiariesService,
    @Inject(FILE_STORAGE) private readonly storage: FileStorageAdapter,
  ) {}

  async uploadTemplate(
    fileBuffer: Buffer,
    name: string,
    productId: string | undefined,
    actor: AuthenticatedUser,
  ): Promise<PolicyDocumentTemplateEntity> {
    if (!fileBuffer.slice(0, 2).equals(Buffer.from('PK'))) {
      throw new BadRequestException('That does not look like a valid .docx file.');
    }
    const stored = await this.storage.save(fileBuffer, `${name}.docx`, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    return this.templatesRepo.save(
      this.templatesRepo.create({ name, storageKey: stored.storageKey, productId: productId ?? null, uploadedBy: actor.id }),
    );
  }

  async listTemplates(): Promise<PolicyDocumentTemplateEntity[]> {
    return this.templatesRepo.find({ order: { createdAt: 'DESC' } });
  }

  async deleteTemplate(id: string): Promise<void> {
    const template = await this.templatesRepo.findOne({ where: { id } });
    if (!template) throw new NotFoundException('Template not found');
    await this.storage.delete(template.storageKey).catch(() => undefined);
    await this.templatesRepo.delete(id);
  }

  private async selectTemplate(productId: string): Promise<PolicyDocumentTemplateEntity> {
    const specific = await this.templatesRepo.findOne({ where: { productId }, order: { createdAt: 'DESC' } });
    if (specific) return specific;
    const general = await this.templatesRepo.findOne({ where: { productId: null as any }, order: { createdAt: 'DESC' } });
    if (general) return general;
    throw new NotFoundException('No policy document template has been uploaded yet. Upload one in Settings first.');
  }

  async generate(policyId: string): Promise<{ buffer: Buffer; filename: string }> {
    const policy = await this.policiesRepo.findOne({ where: { id: policyId }, relations: ['client', 'product'] });
    if (!policy) throw new NotFoundException('Policy not found');

    const template = await this.selectTemplate(policy.product.id);
    const templateBuffer = await this.storage.read(template.storageKey);

    const beneficiaries = await this.beneficiariesService.findByClient(policy.client.id);

    const zip = new PizZip(templateBuffer);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      delimiters: { start: '{{', end: '}}' },
    });

    const insuredName = policy.insuredName || policy.client.fullName;
    const insuredDob = policy.insuredDob || policy.client.dob;

    doc.render({
      // Generic names (kept for compatibility with a plainer template)
      policyNo: policy.policyNo,
      productName: policy.product.name,
      sumAssured: fmtMoney(policy.sumAssured),
      monthlyPremium: fmtMoney(policy.monthlyPremium),
      paymentFrequency: policy.paymentFrequency,
      commencementDate: fmtDate(policy.commencementDate),
      maturityDate: fmtDate(policy.maturityDate),
      issueDate: fmtDate(new Date().toISOString().slice(0, 10)),
      clientName: policy.client.fullName,
      clientNo: policy.client.clientNo,
      clientPhone: policy.client.phone,
      clientAddress: policy.client.address || '—',
      clientDistrict: policy.client.district || '—',
      clientNationalId: policy.client.nationalId || '—',
      clientDob: policy.client.dob ? fmtDate(policy.client.dob) : '—',
      clientGender: policy.client.gender || '—',
      beneficiaries: beneficiaries.map((b) => ({
        name: b.name, relationship: b.relationship || '—', sharePct: `${Number(b.sharePct)}%`,
      })),
      beneficiariesSummary: beneficiaries.length
        ? beneficiaries.map((b) => `${b.name} (${b.relationship || 'Beneficiary'}, ${Number(b.sharePct)}%)`).join('; ')
        : 'None on file',

      // Exact tokens from the real EMI policy document templates - case
      // matches their actual documents precisely, including the
      // inconsistent capitalization already present in them.
      policynumber: policy.policyNo,
      pincode: policy.payrollPinCode || '—',
      commencementdate: fmtDate(policy.commencementDate),
      issuedate: fmtDate(new Date().toISOString().slice(0, 10)),
      declarationdate: fmtDate(policy.commencementDate), // same as commencement date, per EMI's own confirmation
      'insuredName(s)': insuredName,
      Dateofbirth: insuredDob ? fmtDate(insuredDob) : '—',
      Monthlypremium: fmtMoney(policy.monthlyPremium),
      maturitydate: fmtDate(policy.maturityDate),
      policyperiod: formatPolicyPeriod(policy.commencementDate, policy.maturityDate),
      sumassured: fmtMoney(policy.sumAssured),
    });

    const buffer = doc.getZip().generate({ type: 'nodebuffer' });
    const filename = `Policy-Document-${policy.policyNo}.docx`;
    return { buffer, filename };
  }
}
