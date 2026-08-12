import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as XLSX from 'xlsx';
import { DeductionImportRecordEntity, DeductionRecordStatus } from './entities/deduction-import-record.entity';
import { PolicyEntity } from '../clients-policies/entities/policy.entity';
import { PaymentsService } from '../field-collection-wallet/payments.service';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

interface ParsedDeductionRow {
  mdaCode: string | null;
  mdaName: string | null;
  pincode: string;
  employeeName: string;
  amount: number;
}

function parseDeductionFile(buffer: Buffer): ParsedDeductionRow[] {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new BadRequestException('That file has no worksheet to read.');
  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });

  const records: ParsedDeductionRow[] = [];
  let currentMdaCode: string | null = null;
  let currentMdaName: string | null = null;

  for (const row of rows) {
    if (!row || row.length === 0) continue;
    const col0 = row[0];
    const col4 = row[4];
    const col7 = row[7];
    const col12 = row[12];
    const col20 = row[20];

    if (col0 && col4 && col0 !== 'D/FCB' && col0 !== 'PIN CODE' && !col7 && String(col0).length <= 6) {
      currentMdaCode = String(col0).trim();
      currentMdaName = String(col4).trim();
      continue;
    }

    if (col0 && col7 && col7 !== 'NAME' && col7 !== 'TOTAL DEPARTMENT' && col12 === 'Enhanced Mutual Insurance') {
      const amount = typeof col20 === 'number' ? col20 : parseFloat(col20);
      if (isNaN(amount)) continue;
      records.push({
        mdaCode: currentMdaCode,
        mdaName: currentMdaName,
        pincode: String(col0).trim(),
        employeeName: String(col7).trim(),
        amount,
      });
    }
  }
  return records;
}

@Injectable()
export class DeductionImportService {
  constructor(
    @InjectRepository(DeductionImportRecordEntity) private readonly recordsRepo: Repository<DeductionImportRecordEntity>,
    @InjectRepository(PolicyEntity) private readonly policiesRepo: Repository<PolicyEntity>,
    private readonly paymentsService: PaymentsService,
  ) {}

  async importDeductions(
    buffer: Buffer,
    period: string,
    fileName: string,
    actor: AuthenticatedUser,
  ): Promise<{ posted: number; alreadyPosted: number; unmatched: number; zero: number; policyCancelled: number }> {
    if (!/^\d{4}-\d{2}$/.test(period)) {
      throw new BadRequestException('period must be in YYYY-MM format.');
    }
    const rows = parseDeductionFile(buffer);
    if (rows.length === 0) {
      throw new BadRequestException('No deduction rows for Enhanced Mutual Insurance were found in that file - check it is the right export.');
    }

    const counts = { posted: 0, alreadyPosted: 0, unmatched: 0, zero: 0, policyCancelled: 0 };

    for (const row of rows) {
      const base = {
        period, mdaCode: row.mdaCode, mdaName: row.mdaName, pincode: row.pincode,
        employeeName: row.employeeName, amount: row.amount.toFixed(2), sourceFileName: fileName,
      };

      if (row.amount <= 0) {
        await this.recordsRepo.save(this.recordsRepo.create({ ...base, status: 'Zero', matchedPolicyId: null, matchedPaymentId: null }));
        counts.zero++;
        continue;
      }

      const policy = await this.policiesRepo.findOne({ where: { payrollPinCode: row.pincode } });
      if (!policy) {
        await this.recordsRepo.save(this.recordsRepo.create({ ...base, status: 'Unmatched', matchedPolicyId: null, matchedPaymentId: null }));
        counts.unmatched++;
        continue;
      }
      if (policy.status === 'Cancelled') {
        await this.recordsRepo.save(this.recordsRepo.create({ ...base, status: 'PolicyCancelled', matchedPolicyId: policy.id, matchedPaymentId: null }));
        counts.policyCancelled++;
        continue;
      }

      const idempotencyKey = `deduction-${row.pincode}-${period}`;
      const existingPayment = await this.paymentsService.findByIdempotencyKey(idempotencyKey);
      if (existingPayment) {
        await this.recordsRepo.save(this.recordsRepo.create({ ...base, status: 'AlreadyPosted', matchedPolicyId: policy.id, matchedPaymentId: existingPayment.id }));
        counts.alreadyPosted++;
        continue;
      }

      const payment = await this.paymentsService.postPayment(
        { policyId: policy.id, paymentMonth: period, amount: row.amount, paymentMethod: 'Payroll Deduction' },
        idempotencyKey,
        actor,
      );
      await this.recordsRepo.save(this.recordsRepo.create({ ...base, status: 'Posted', matchedPolicyId: policy.id, matchedPaymentId: payment.id }));
      counts.posted++;
    }

    return counts;
  }

  async listRecords(filters: { period?: string; status?: DeductionRecordStatus; mdaName?: string; search?: string }): Promise<DeductionImportRecordEntity[]> {
    const qb = this.recordsRepo.createQueryBuilder('r').orderBy('r.createdAt', 'DESC');
    if (filters.period) qb.andWhere('r.period = :period', { period: filters.period });
    if (filters.status) qb.andWhere('r.status = :status', { status: filters.status });
    if (filters.mdaName) qb.andWhere('r.mdaName = :mdaName', { mdaName: filters.mdaName });
    if (filters.search) {
      qb.andWhere('(r.employeeName ILIKE :search OR r.pincode ILIKE :search)', { search: `%${filters.search}%` });
    }
    return qb.getMany();
  }
}
