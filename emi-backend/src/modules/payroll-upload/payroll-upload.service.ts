import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as ExcelJS from 'exceljs';
import * as crypto from 'crypto';
import { ClientEntity } from '../clients-policies/entities/client.entity';
import { PolicyEntity } from '../clients-policies/entities/policy.entity';
import { ProductEntity } from '../clients-policies/entities/product.entity';
import { PaymentsService } from '../field-collection-wallet/payments.service';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

interface PayrollRowResult {
  row: number;
  employeeName: string;
  status: 'client_created' | 'client_matched';
  policyStatus: 'policy_created' | 'policy_matched';
  paymentStatus: 'posted' | 'already_posted';
  error?: string;
}

const REQUIRED_HEADERS = ['employee name', 'phone', 'monthly deduction'];

@Injectable()
export class PayrollUploadService {
  constructor(
    @InjectRepository(ClientEntity) private readonly clientsRepo: Repository<ClientEntity>,
    @InjectRepository(PolicyEntity) private readonly policiesRepo: Repository<PolicyEntity>,
    @InjectRepository(ProductEntity) private readonly productsRepo: Repository<ProductEntity>,
    private readonly paymentsService: PaymentsService,
  ) {}

  /**
   * Expects the first row to be headers (case-insensitive, order doesn't
   * matter): "Employee Name", "Phone", "Monthly Deduction" are required;
   * "National ID" and "District" are optional but improve matching and
   * data quality respectively.
   *
   * Designed to be run every month against the same file (updated with
   * that month's figures): an employee already on file is matched, not
   * re-created, by National ID when given, otherwise by phone number.
   * Their existing Endowment policy is reused if one exists rather than
   * creating a duplicate. The payment itself is idempotent per
   * (employer, employee, period), so re-running the exact same upload
   * for a period that's already been processed changes nothing instead
   * of double-posting.
   */
  async processFile(
    buffer: Buffer,
    employerOrGroup: string,
    period: string,
    actor: AuthenticatedUser,
  ): Promise<{ results: PayrollRowResult[]; summary: Record<string, number> }> {
    if (!/^\d{4}-\d{2}$/.test(period)) {
      throw new BadRequestException('period must be in YYYY-MM format');
    }
    const product = await this.productsRepo.findOne({ where: { name: 'Endowment' } });
    if (!product) {
      throw new BadRequestException('No product named "Endowment" exists - cannot enroll payroll clients without it.');
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);
    const sheet = workbook.worksheets[0];
    if (!sheet) throw new BadRequestException('The uploaded file has no worksheet.');

    const headerRow = sheet.getRow(1);
    const columnIndex: Record<string, number> = {};
    headerRow.eachCell((cell, colNumber) => {
      const key = String(cell.value ?? '').trim().toLowerCase();
      if (key) columnIndex[key] = colNumber;
    });
    const missing = REQUIRED_HEADERS.filter((h) => !(h in columnIndex));
    if (missing.length > 0) {
      throw new BadRequestException(`Missing required column(s): ${missing.join(', ')}`);
    }

    const results: PayrollRowResult[] = [];
    const summary = { clientsCreated: 0, clientsMatched: 0, policiesCreated: 0, policiesMatched: 0, paymentsPosted: 0, paymentsAlreadyPosted: 0, rowsFailed: 0 };

    for (let rowNum = 2; rowNum <= sheet.rowCount; rowNum++) {
      const row = sheet.getRow(rowNum);
      const cell = (name: string) => row.getCell(columnIndex[name]).value;
      const employeeName = String(cell('employee name') ?? '').trim();
      if (!employeeName) continue; // blank trailing row, not an error

      try {
        const phone = String(cell('phone') ?? '').trim();
        const nationalId = columnIndex['national id'] ? String(cell('national id') ?? '').trim() : '';
        const district = columnIndex['district'] ? String(cell('district') ?? '').trim() : '';
        const deductionRaw = cell('monthly deduction');
        const deduction = typeof deductionRaw === 'number' ? deductionRaw : parseFloat(String(deductionRaw ?? ''));

        if (!phone) throw new Error('Phone is required');
        if (!deduction || deduction <= 0) throw new Error('Monthly Deduction must be a positive number');

        const { client, wasCreated: clientCreated } = await this.findOrCreateClient(
          employeeName, phone, nationalId, district, employerOrGroup,
        );
        if (clientCreated) summary.clientsCreated++; else summary.clientsMatched++;

        const { policy, wasCreated: policyCreated } = await this.findOrCreatePolicy(client, product, deduction, period);
        if (policyCreated) summary.policiesCreated++; else summary.policiesMatched++;

        const matchKey = nationalId || phone;
        const idempotencyKey = `payroll-${employerOrGroup}-${matchKey}-${period}`;
        const existingCount = await this.paymentAlreadyExists(idempotencyKey);
        await this.paymentsService.postPayment(
          { policyId: policy.id, paymentMonth: period, amount: deduction, paymentMethod: 'Payroll Deduction' },
          idempotencyKey,
          actor,
        );
        if (existingCount) summary.paymentsAlreadyPosted++; else summary.paymentsPosted++;

        results.push({
          row: rowNum, employeeName,
          status: clientCreated ? 'client_created' : 'client_matched',
          policyStatus: policyCreated ? 'policy_created' : 'policy_matched',
          paymentStatus: existingCount ? 'already_posted' : 'posted',
        });
      } catch (error) {
        summary.rowsFailed++;
        results.push({
          row: rowNum, employeeName, status: 'client_matched', policyStatus: 'policy_matched', paymentStatus: 'already_posted',
          error: (error as Error).message,
        });
      }
    }

    return { results, summary };
  }

  private async paymentAlreadyExists(idempotencyKey: string): Promise<boolean> {
    const existing = await this.paymentsService.findByIdempotencyKey(idempotencyKey);
    return !!existing;
  }

  private async findOrCreateClient(
    fullName: string, phone: string, nationalId: string, district: string, employerOrGroup: string,
  ): Promise<{ client: ClientEntity; wasCreated: boolean }> {
    let client: ClientEntity | null = null;
    if (nationalId) {
      client = await this.clientsRepo.findOne({ where: { nationalId } });
    }
    if (!client) {
      client = await this.clientsRepo.findOne({ where: { phone } });
    }
    if (client) return { client, wasCreated: false };

    const count = await this.clientsRepo.count();
    const clientNo = `CL-${String(count + 1).padStart(5, '0')}`;
    const created = await this.clientsRepo.save(
      this.clientsRepo.create({
        clientNo, fullName, phone, nationalId: nationalId || undefined, district: district || undefined,
        employerOrGroup, referralCode: clientNo.replace('CL-', 'REF-'),
        // Deliberately not assumed true - payroll data doesn't carry
        // explicit consent, so this defaults conservatively and can be
        // updated once real consent is confirmed with the employee.
        smsConsent: false,
        kycStatus: 'Pending', status: 'Active',
      }),
    );
    return { client: created, wasCreated: true };
  }

  private async findOrCreatePolicy(
    client: ClientEntity, product: ProductEntity, monthlyDeduction: number, period: string,
  ): Promise<{ policy: PolicyEntity; wasCreated: boolean }> {
    const existing = await this.policiesRepo.findOne({
      where: { client: { id: client.id }, product: { id: product.id } },
    });
    if (existing) return { policy: existing, wasCreated: false };

    const policyNo = `PR-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const created = await this.policiesRepo.save(
      this.policiesRepo.create({
        policyNo, client, product,
        // No actuarial basis is available from payroll data alone - this
        // is a clearly-flagged placeholder (12x the monthly deduction)
        // pending real underwriting, not a computed sum assured.
        sumAssured: (monthlyDeduction * 12).toFixed(2),
        monthlyPremium: monthlyDeduction.toFixed(2),
        commencementDate: `${period}-01`,
        paymentMethod: 'Payroll Deduction',
        status: 'Active',
      }),
    );
    return { policy: created, wasCreated: true };
  }
}
