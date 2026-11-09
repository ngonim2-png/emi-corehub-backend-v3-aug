import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as XLSX from 'xlsx';
import { randomUUID } from 'crypto';
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

/** Pincodes compare ignoring spaces, case and leading zeros: " 0111389" matches "111389". */
export function normalizePincode(v: unknown): string {
  const s = String(v ?? '').replace(/\s+/g, '').toUpperCase();
  return /^\d+$/.test(s) ? s.replace(/^0+(?=\d)/, '') : s;
}

const FULL_MONTH_NAMES: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

/**
 * The real file states its own period directly in a header cell - "AUGUST,
 * 2026" confirmed verbatim in a real export - so the month doesn't need
 * to be typed in separately every upload. Scans only the first several
 * rows (where this always appears in the real file) rather than the
 * whole sheet, both for speed and to avoid an unrelated cell elsewhere
 * coincidentally matching the pattern.
 */
function extractPeriodFromMdaFile(rows: any[][]): string | null {
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const row = rows[i];
    if (!row) continue;
    for (const cell of row) {
      if (!cell) continue;
      const m = String(cell).trim().match(/^([A-Za-z]+),?\s*(\d{4})$/);
      if (!m) continue;
      const monthNum = FULL_MONTH_NAMES[m[1].toLowerCase()];
      if (monthNum) return `${m[2]}-${String(monthNum).padStart(2, '0')}`;
    }
  }
  return null;
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
function parseDeductionFile(buffer: Buffer): { rows: ParsedDeductionRow[]; detectedPeriod: string | null } {
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
  if (!cols) return { rows: records, detectedPeriod: extractPeriodFromMdaFile(rows) }; // no recognizable header found anywhere - nothing reliable to parse

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
  return { rows: records, detectedPeriod: extractPeriodFromMdaFile(rows) };
}

const MONTH_ABBREVIATIONS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, apl: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

/** Parses a sheet name like "APR-2026", "DEC2025", or "APL-2025" (a real typo for April seen in the actual file) into a YYYY-MM period, or null if the sheet name doesn't look like a month at all - used to skip non-data sheets like a cover/summary tab. */
function parsePeriodFromSheetName(sheetName: string): string | null {
  const m = sheetName.trim().match(/^([A-Za-z]{3,4})-?(\d{4})$/);
  if (!m) return null;
  const monthNum = MONTH_ABBREVIATIONS[m[1].toLowerCase()];
  if (!monthNum) return null;
  return `${m[2]}-${String(monthNum).padStart(2, '0')}`;
}

/**
 * EMI's own deduction database as received from the Accountant General -
 * genuinely different from the format parseDeductionFile() above handles.
 * That one is the AG's raw, unfiltered payroll export with MDA blocks
 * covering every department; this one is already filtered to EMI's own
 * clients specifically, one sheet per month, with simple columns: a
 * "POLICY NO." column that is the AG's own reference code (confirmed
 * against a real file - it does not match EMI's actual policy numbers,
 * e.g. "PSS00258" in this file vs "SSC001" for the same real client in
 * EMI's own system), plus CLIENTS NAMES, PINCODE, and PREMIUM. Matching
 * therefore has to go by pincode, exactly like the MDA-format import
 * already does - the AG's policy number here is not usable for matching
 * and is kept only for audit/reference on the resulting record.
 */
function parseEmiEndowmentDeductionFile(buffer: Buffer): Map<string, ParsedDeductionRow[]> {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const byPeriod = new Map<string, ParsedDeductionRow[]>();

  for (const sheetName of wb.SheetNames) {
    const period = parsePeriodFromSheetName(sheetName);
    if (!period) continue; // not a recognizable month sheet - e.g. a cover/summary tab - skip quietly

    const ws = wb.Sheets[sheetName];
    const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });
    if (rows.length === 0) continue;

    const headerRow = rows[0] || [];
    const col: Record<string, number> = {};
    headerRow.forEach((h, idx) => { if (h) col[String(h).trim().toUpperCase()] = idx; });
    const cPolicy = col['POLICY NO.'] ?? col['POLICY NO'];
    const cName = col['CLIENTS NAMES'] ?? col['CLIENT NAMES'] ?? col['NAME'];
    const cPincode = col['PINCODE'] ?? col['PIN-CODE'] ?? col['PIN CODE'];
    const cPremium = col['PREMIUM'] ?? col['PREMIUN'];
    if (cPincode === undefined || cName === undefined || cPremium === undefined) continue; // not a real data sheet - skip quietly

    const parsedRows: ParsedDeductionRow[] = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row) continue;
      const pincodeCell = row[cPincode];
      const nameCell = row[cName];
      if (!pincodeCell || !nameCell) continue;
      const amountCell = row[cPremium];
      const amount = typeof amountCell === 'number' ? amountCell : parseFloat(amountCell);
      parsedRows.push({
        mdaCode: cPolicy !== undefined && row[cPolicy] ? String(row[cPolicy]).trim() : null,
        mdaName: null,
        pincode: String(pincodeCell).trim(),
        employeeName: String(nameCell).trim(),
        amount: isNaN(amount) ? 0 : amount,
      });
    }
    if (parsedRows.length > 0) byPeriod.set(period, parsedRows);
  }
  return byPeriod;
}

@Injectable()
export class DeductionImportService {
  constructor(
    @InjectRepository(DeductionImportRecordEntity) private readonly recordsRepo: Repository<DeductionImportRecordEntity>,
    @InjectRepository(PolicyEntity) private readonly policiesRepo: Repository<PolicyEntity>,
    private readonly paymentsService: PaymentsService,
  ) {}

  /**
   * Turns one month of AG deduction lines into payments.
   *
   * - Every line is recorded. The AG file can list the same pincode more
   *   than once in a month (a person with two policies, or an extra
   *   deduction); each line is its own payment. The duplicate guard key is
   *   pincode + month + the line's position for that pincode in the file
   *   (the first line keeps the original key, so files uploaded before
   *   this change are recognised and nothing is posted twice).
   * - When one pincode belongs to several policies, each line goes to the
   *   policy whose monthly premium equals the amount, otherwise to the
   *   next policy that hasn't received a line yet this month.
   * - Pincodes match ignoring spaces, case and leading zeros.
   * - Every line of one upload shares an importBatch id, so the dashboard
   *   can compare the file's own total with what was recorded.
   */
  private async processRows(
    rows: ParsedDeductionRow[],
    period: string,
    fileName: string,
    actor: AuthenticatedUser,
  ): Promise<{ posted: number; alreadyPosted: number; unmatched: number; zero: number; policyCancelled: number }> {
    const counts = { posted: 0, alreadyPosted: 0, unmatched: 0, zero: 0, policyCancelled: 0 };
    const importBatch = randomUUID();

    // Index every policy with a pincode once, instead of one lookup per line.
    const withPin = await this.policiesRepo.createQueryBuilder('p').where('p.payrollPinCode IS NOT NULL').getMany();
    const byPin = new Map<string, PolicyEntity[]>();
    for (const p of withPin) {
      const k = normalizePincode(p.payrollPinCode);
      if (!k) continue;
      if (!byPin.has(k)) byPin.set(k, []);
      byPin.get(k)!.push(p);
    }
    for (const list of byPin.values()) list.sort((x, y) => (x.createdAt < y.createdAt ? -1 : 1));

    const occurrence = new Map<string, number>(); // pincode -> lines seen so far in this file
    const usedPolicies = new Map<string, Set<string>>(); // pincode -> policies that got a line this month

    for (const row of rows) {
      const pinKey = normalizePincode(row.pincode);
      const occ = occurrence.get(pinKey) ?? 0;
      occurrence.set(pinKey, occ + 1);
      const base = {
        period, mdaCode: row.mdaCode, mdaName: row.mdaName, pincode: row.pincode,
        employeeName: row.employeeName, amount: row.amount.toFixed(2), sourceFileName: fileName, importBatch,
      };

      if (row.amount <= 0) {
        await this.recordsRepo.save(this.recordsRepo.create({ ...base, status: 'Zero', matchedPolicyId: null, matchedPaymentId: null }));
        counts.zero++;
        continue;
      }

      const all = byPin.get(pinKey) ?? [];
      if (all.length === 0) {
        await this.recordsRepo.save(this.recordsRepo.create({ ...base, status: 'Unmatched', matchedPolicyId: null, matchedPaymentId: null }));
        counts.unmatched++;
        continue;
      }
      const live = all.filter((p) => p.status !== 'Cancelled');
      if (live.length === 0) {
        await this.recordsRepo.save(this.recordsRepo.create({ ...base, status: 'PolicyCancelled', matchedPolicyId: all[0].id, matchedPaymentId: null }));
        counts.policyCancelled++;
        continue;
      }

      if (!usedPolicies.has(pinKey)) usedPolicies.set(pinKey, new Set());
      const used = usedPolicies.get(pinKey)!;
      const idempotencyKey = occ === 0 ? `deduction-${row.pincode}-${period}` : `deduction-${row.pincode}-${period}-${occ + 1}`;
      const existingPayment = await this.paymentsService.findByIdempotencyKey(idempotencyKey);
      if (existingPayment) {
        const pid = (existingPayment as any).policy?.id;
        if (pid) used.add(pid);
        await this.recordsRepo.save(this.recordsRepo.create({ ...base, status: 'AlreadyPosted', matchedPolicyId: pid ?? null, matchedPaymentId: existingPayment.id }));
        counts.alreadyPosted++;
        continue;
      }

      const amountMinor = Math.round(row.amount * 100);
      const notUsed = live.filter((p) => !used.has(p.id));
      const policy =
        notUsed.find((p) => Math.round(Number(p.monthlyPremium) * 100) === amountMinor) ??
        notUsed[0] ??
        live.find((p) => Math.round(Number(p.monthlyPremium) * 100) === amountMinor) ??
        live[0];
      used.add(policy.id);

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

  /**
   * What the latest AG upload for each month contained, next to what was
   * recorded: the file's own total, and the lines that could not be
   * recorded (no policy with that pincode, or the policy is cancelled).
   */
  async fileSummaryForPeriods(periods: string[]) {
    const out: Record<string, { fileName: string; uploadedAt: Date; lines: number; total: number; recorded: number; recordedLines: number; unmatched: number; unmatchedLines: number; cancelled: number; cancelledLines: number; zeroLines: number } | null> = {};
    for (const period of periods) {
      const latest = await this.recordsRepo.createQueryBuilder('r')
        .where('r.period = :period', { period }).andWhere('r.importBatch IS NOT NULL')
        .orderBy('r.createdAt', 'DESC').limit(1).getOne();
      if (!latest) { out[period] = null; continue; }
      const recs = await this.recordsRepo.find({ where: { period, importBatch: latest.importBatch as string } });
      const sum = (st: string[]) => recs.filter((r) => st.includes(r.status)).reduce((t, r) => t + Number(r.amount), 0);
      const n = (st: string[]) => recs.filter((r) => st.includes(r.status)).length;
      out[period] = {
        fileName: latest.sourceFileName, uploadedAt: latest.createdAt,
        lines: recs.length, total: recs.reduce((t, r) => t + Number(r.amount), 0),
        recorded: sum(['Posted', 'AlreadyPosted']), recordedLines: n(['Posted', 'AlreadyPosted']),
        unmatched: sum(['Unmatched']), unmatchedLines: n(['Unmatched']),
        cancelled: sum(['PolicyCancelled']), cancelledLines: n(['PolicyCancelled']),
        zeroLines: n(['Zero']),
      };
    }
    return out;
  }

  /** The AG lines from the latest upload for a month that could not be recorded. */
  async notRecordedLines(period: string) {
    const latest = await this.recordsRepo.createQueryBuilder('r')
      .where('r.period = :period', { period }).andWhere('r.importBatch IS NOT NULL')
      .orderBy('r.createdAt', 'DESC').limit(1).getOne();
    if (!latest) return [];
    const recs = await this.recordsRepo.find({ where: { period, importBatch: latest.importBatch as string } });
    return recs
      .filter((r) => r.status === 'Unmatched' || r.status === 'PolicyCancelled')
      .map((r) => ({ pincode: r.pincode, employeeName: r.employeeName, mdaName: r.mdaName ?? '', amount: Number(r.amount), reason: r.status === 'Unmatched' ? 'No policy with this pincode' : 'Policy is cancelled' }))
      .sort((x, y) => x.employeeName.localeCompare(y.employeeName));
  }

  async importDeductions(
    buffer: Buffer,
    period: string | undefined,
    fileName: string,
    actor: AuthenticatedUser,
  ): Promise<{ posted: number; alreadyPosted: number; unmatched: number; zero: number; policyCancelled: number; periodUsed: string }> {
    const { rows, detectedPeriod } = parseDeductionFile(buffer);
    if (rows.length === 0) {
      throw new BadRequestException('No deduction rows for Enhanced Mutual Insurance were found in that file - check it is the right export.');
    }
    // An explicit period always wins (a manual override for the rare
    // case auto-detection is wrong or a file lacks its own header text),
    // otherwise the file's own stated period - "AUGUST, 2026" confirmed
    // verbatim in a real file - is used automatically.
    const periodToUse = period || detectedPeriod;
    if (!periodToUse || !/^\d{4}-\d{2}$/.test(periodToUse)) {
      throw new BadRequestException('Could not determine which month this file is for - the file did not state it in a recognizable way, and none was given explicitly.');
    }
    const counts = await this.processRows(rows, periodToUse, fileName, actor);
    return { ...counts, periodUsed: periodToUse };
  }

  /**
   * The raw file as received from the AG's office, covering multiple
   * months in one file (one sheet per month) - every recognizable month
   * sheet is processed in this single upload, each against its own
   * period, rather than requiring a separate upload per month.
   */
  async importEmiEndowmentFile(
    buffer: Buffer,
    fileName: string,
    actor: AuthenticatedUser,
  ): Promise<{ perMonth: Record<string, { posted: number; alreadyPosted: number; unmatched: number; zero: number; policyCancelled: number }>; monthsProcessed: number }> {
    const byPeriod = parseEmiEndowmentDeductionFile(buffer);
    if (byPeriod.size === 0) {
      throw new BadRequestException('No recognizable month sheets were found in that file - check it is a real Accountant General endowment deduction export.');
    }
    const perMonth: Record<string, { posted: number; alreadyPosted: number; unmatched: number; zero: number; policyCancelled: number }> = {};
    for (const [period, rows] of byPeriod) {
      perMonth[period] = await this.processRows(rows, period, fileName, actor);
    }
    return { perMonth, monthsProcessed: byPeriod.size };
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
