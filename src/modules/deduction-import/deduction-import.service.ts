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

/**
 * Column positions are detected dynamically from the "PIN CODE" header
 * row rather than assumed fixed - confirmed necessary against real
 * files: the Accountant General's export shifted every column one
 * position to the right between two real files we've seen (an added
 * leading "Status" column), and there's no reason to assume it won't
 * shift again. The amount column sits one position to the left of
 * where its own "ADV AMOUNT" header label appears (a consistent
 * merged-cell quirk in the source report, verified against all header
 * blocks in a real file) - not the same position as the label itself.
 * The MDA code/name row immediately preceding each block uses the
 * same pincode column for its code, and pincode column + 4 for the
 * name - also verified directly against real files rather than
 * assumed.
 */
function parseDeductionFile(buffer: Buffer): ParsedDeductionRow[] {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new BadRequestException('That file has no worksheet to read.');
  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });

  const records: ParsedDeductionRow[] = [];
  let currentMdaCode: string | null = null;
  let currentMdaName: string | null = null;

  // The column mapping is consistent for the whole file (verified
  // against real exports), but the very first MDA block's info row
  // appears *before* its own header row - so without this pre-scan,
  // that first block's code/name would be silently lost even though
  // every later block's would be captured correctly.
  let cols: { pin: number; name: number; desc: number; amt: number } | null = null;
  for (const row of rows) {
    if (!row) continue;
    const pinHeaderCol = row.indexOf('PIN CODE');
    if (pinHeaderCol === -1) continue;
    const nameHeaderCol = row.indexOf('NAME');
    const descHeaderCol = row.indexOf('DESCRIPTION');
    const amtHeaderCol = row.indexOf('ADV AMOUNT');
    if (nameHeaderCol !== -1 && descHeaderCol !== -1 && amtHeaderCol !== -1) {
      cols = { pin: pinHeaderCol, name: nameHeaderCol, desc: descHeaderCol, amt: amtHeaderCol - 1 };
      break;
    }
  }
  if (!cols) return records; // no recognizable header found anywhere - nothing reliable to parse

  for (const row of rows) {
    if (!row || row.length === 0) continue;

    if (row.indexOf('PIN CODE') !== -1) continue; // already used to establish cols above - skip re-processing as data

    // MDA info row: a short code sitting in the same column pincode
    // data will later occupy, with the MDA's name 4 columns further
    // along - and critically, nothing in the name column itself
    // (that's what distinguishes it from an actual data row).
    const possibleCode = row[cols.pin];
    const possibleName = row[cols.pin + 4];
    if (possibleCode && possibleName && !row[cols.name] && possibleCode !== 'D/FCB' && String(possibleCode).trim().length <= 6) {
      currentMdaCode = String(possibleCode).trim();
      currentMdaName = String(possibleName).trim();
      continue;
    }

    const pincodeCell = row[cols.pin];
    const nameCell = row[cols.name];
    const descCell = row[cols.desc];
    const amountCell = row[cols.amt];
    if (pincodeCell && nameCell && nameCell !== 'TOTAL DEPARTMENT' && descCell === 'Enhanced Mutual Insurance') {
      const amount = typeof amountCell === 'number' ? amountCell : parseFloat(amountCell);
      if (isNaN(amount)) continue;
      records.push({
        mdaCode: currentMdaCode,
        mdaName: currentMdaName,
        pincode: String(pincodeCell).trim(),
        employeeName: String(nameCell).trim(),
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
