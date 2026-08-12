import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as ExcelJS from 'exceljs';
import { RosterImportIssueEntity } from './entities/roster-import-issue.entity';
import { PolicyEntity } from '../clients-policies/entities/policy.entity';
import { ClientEntity } from '../clients-policies/entities/client.entity';
import { ProductEntity } from '../clients-policies/entities/product.entity';
import { ClientsService } from '../clients-policies/clients.service';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

const DESIGNATION_FIXES: Record<string, string> = { P0LICE: 'POLICE', PRIONS: 'PRISONS' };

interface ParsedRosterRow {
  rowIndex: number;
  statusRaw: string | null;
  policyNo: string | null;
  name: string;
  pincode: string | null;
  premium: number | null;
  sumAssured: number | null;
  designation: string | null;
  commencementDate: string | null;
  maturityDate: string | null;
  commencementDateUnparsed: boolean;
  maturityDateUnparsed: boolean;
  broker: string | null;
  /** The actual insured life, when it differs from the client/policyholder (e.g. Pikin's parent-insures-child rows). Null means self-insured. */
  insuredName?: string | null;
  phone?: string | null;
  address?: string | null;
  /**
   * Groups rows that share the same real-world client (e.g. one parent
   * with several children each on their own row). Rows with the same
   * clientGroupKey reuse a single created client record instead of
   * each spawning a new one. Undefined means "always a new client" -
   * the behavior every existing parser already has.
   */
  clientGroupKey?: string;
}

function parseGarbledDate(raw: string): string | null {
  const m = raw.match(/([A-Za-z]{3})-(\d{2})/);
  if (!m) return null;
  const monthMap: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
  const mon = monthMap[m[1].toLowerCase()];
  if (mon === undefined) return null;
  const year = 2000 + parseInt(m[2], 10);
  return new Date(Date.UTC(year, mon, 1)).toISOString().slice(0, 10);
}

function parseDateCell(value: any): { date: string | null; unparsed: boolean } {
  if (!value) return { date: null, unparsed: false };
  if (value instanceof Date) return { date: value.toISOString().slice(0, 10), unparsed: false };
  if (typeof value === 'string') {
    const parsed = parseGarbledDate(value);
    return parsed ? { date: parsed, unparsed: false } : { date: null, unparsed: true };
  }
  return { date: null, unparsed: true };
}

/**
 * The Civil Servant Super Savings roster mixes three date
 * representations in the same column: a real Date object (when Excel
 * auto-formatted the cell), a DD/MM/YYYY text string (Sierra Leone
 * date order - confirmed unambiguous against the real file since some
 * day values exceed 12), or a raw Excel serial number (when the cell
 * wasn't formatted as a date at all). A blank cell is not an error
 * here - staff just didn't record a date for that row - so blanks
 * report unparsed:false with a null date, distinct from a value that
 * was present but genuinely unreadable.
 */
function parseCssDateCell(value: any): { date: string | null; unparsed: boolean } {
  if (value === null || value === undefined || value === '') return { date: null, unparsed: false };
  if (value instanceof Date) return { date: value.toISOString().slice(0, 10), unparsed: false };
  if (typeof value === 'number') {
    const d = new Date(Date.UTC(1899, 11, 30) + value * 86400 * 1000);
    if (isNaN(d.getTime())) return { date: null, unparsed: true };
    return { date: d.toISOString().slice(0, 10), unparsed: false };
  }
  if (typeof value === 'string') {
    const m = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return { date: null, unparsed: true };
    const day = parseInt(m[1], 10);
    const month = parseInt(m[2], 10);
    const year = parseInt(m[3], 10);
    if (month < 1 || month > 12 || day < 1 || day > 31) return { date: null, unparsed: true };
    return { date: new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10), unparsed: false };
  }
  return { date: null, unparsed: true };
}

/** Finds a column index by matching the header row's cell text against any of the given candidate labels (trimmed, case-insensitive) - resilient to the minor header wording/ordering differences seen between the CSS main sheet and its SLRSA sheet. */
/** Parses "3 YEARS" / "3YEARS" / "6 Years" style text into a whole number of years. Returns null if the text doesn't contain a recognizable year count. */
function parseYearsDuration(raw: string): number | null {
  const m = raw.match(/(\d+)\s*YEARS?/i);
  if (!m) return null;
  return parseInt(m[1], 10);
}

/** Computes an ISO maturity date from a commencement date plus a whole-year duration - used when a roster gives "Maturity Period" as a duration rather than an actual date. */
function addYearsToDate(commencementDate: string, years: number): string {
  const d = new Date(commencementDate);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d.toISOString().slice(0, 10);
}

function findColumnByHeader(headerRow: ExcelJS.Row, candidates: string[]): number | null {
  for (let c = 1; c <= headerRow.cellCount; c++) {
    const val = headerRow.getCell(c).value;
    if (!val) continue;
    const text = String(val).trim().toLowerCase();
    if (candidates.some((cand) => text === cand.toLowerCase())) return c;
  }
  return null;
}

@Injectable()
export class RosterImportService {
  constructor(
    @InjectRepository(RosterImportIssueEntity) private readonly issuesRepo: Repository<RosterImportIssueEntity>,
    @InjectRepository(PolicyEntity) private readonly policiesRepo: Repository<PolicyEntity>,
    @InjectRepository(ProductEntity) private readonly productsRepo: Repository<ProductEntity>,
    private readonly clientsService: ClientsService,
  ) {}

  private async parsePaySmolSmolRoster(buffer: Buffer): Promise<ParsedRosterRow[]> {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as any);
    const ws = wb.worksheets[0];
    if (!ws) throw new BadRequestException('That file has no worksheet to read.');

    const rows: ParsedRosterRow[] = [];
    for (let r = 5; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const nameCell = row.getCell(4).value;
      if (!nameCell) continue;

      const statusRaw = row.getCell(2).value;
      const policyNoCell = row.getCell(3).value;
      const pincodeCell = row.getCell(5).value;
      const premiumCell = row.getCell(6).value;
      const sumAssuredCell = row.getCell(7).value;
      const designationCell = row.getCell(8).value;
      const cdateResult = parseDateCell(row.getCell(9).value);
      const mdateResult = parseDateCell(row.getCell(10).value);
      const brokerCell = row.getCell(11).value;

      const designationTrimmed = designationCell ? String(designationCell).trim() : null;
      const designation = designationTrimmed && DESIGNATION_FIXES[designationTrimmed] ? DESIGNATION_FIXES[designationTrimmed] : designationTrimmed;

      rows.push({
        rowIndex: r,
        statusRaw: statusRaw ? String(statusRaw).trim() : null,
        policyNo: policyNoCell ? String(policyNoCell).trim() : null,
        name: String(nameCell).trim(),
        pincode: pincodeCell ? String(pincodeCell).trim() : null,
        premium: typeof premiumCell === 'number' ? premiumCell : null,
        sumAssured: typeof sumAssuredCell === 'number' ? sumAssuredCell : null,
        designation,
        commencementDate: cdateResult.date,
        maturityDate: mdateResult.date,
        commencementDateUnparsed: cdateResult.unparsed,
        maturityDateUnparsed: mdateResult.unparsed,
        broker: brokerCell ? String(brokerCell).trim() : null,
      });
    }
    return rows;
  }

  /**
   * The Civil Servant Super Savings roster: a main data sheet plus an
   * "SLRSA" sheet holding the same kind of rows for that one MDA,
   * separately. A fourth sheet ("SIB") is a genuinely unrelated list
   * (no policy/pincode/premium fields at all) and is deliberately never
   * read here. No Sum Assured or reliable Maturity Date exists in this
   * roster at all - both are left null for manual follow-up, same as
   * agreed for Pay Smol Smol's missing fields. Institution/designation
   * is read and stored exactly as written, since it mixes agency
   * codes, school names, and job titles inconsistently in the source
   * data itself - not something to guess a "fix" for.
   */
  private async parseCssRoster(buffer: Buffer): Promise<ParsedRosterRow[]> {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as any);

    const rows: ParsedRosterRow[] = [];

    const parseSheet = (ws: ExcelJS.Worksheet, headerRowNumber: number) => {
      const headerRow = ws.getRow(headerRowNumber);
      const colName = findColumnByHeader(headerRow, ['Client Names', 'CLIENT NAMES']);
      const colDate = findColumnByHeader(headerRow, ['Date']);
      const colPolicyNo = findColumnByHeader(headerRow, ['Policy ID', 'Policy No', 'POLICY NO']);
      const colInstitution = findColumnByHeader(headerRow, ['Institution']);
      const colPincode = findColumnByHeader(headerRow, ['Pin-code', 'Pin Code', 'PIN CODE']);
      const colPremium = findColumnByHeader(headerRow, ['Premium']);
      const colAgent = findColumnByHeader(headerRow, ['Agent Names', 'AGENT NAMES']);
      if (!colName) return; // not a recognizable sheet - skip it rather than guess

      for (let r = headerRowNumber + 1; r <= ws.rowCount; r++) {
        const row = ws.getRow(r);
        const nameCell = row.getCell(colName).value;
        if (!nameCell) continue;

        const cdateResult = colDate ? parseCssDateCell(row.getCell(colDate).value) : { date: null, unparsed: false };
        const policyNoCell = colPolicyNo ? row.getCell(colPolicyNo).value : null;
        const institutionCell = colInstitution ? row.getCell(colInstitution).value : null;
        const pincodeCell = colPincode ? row.getCell(colPincode).value : null;
        const premiumCell = colPremium ? row.getCell(colPremium).value : null;
        const agentCell = colAgent ? row.getCell(colAgent).value : null;

        rows.push({
          rowIndex: r,
          statusRaw: null, // no status/cancellation column exists in this roster
          policyNo: policyNoCell ? String(policyNoCell).trim() : null,
          name: String(nameCell).trim(),
          pincode: pincodeCell ? String(pincodeCell).trim() : null,
          premium: typeof premiumCell === 'number' ? premiumCell : null,
          sumAssured: null, // not present in this roster - manual follow-up, as agreed
          designation: institutionCell ? String(institutionCell).trim() : null,
          commencementDate: cdateResult.date,
          maturityDate: null, // "Maturity Period" exists as a header but is unpopulated throughout this roster
          commencementDateUnparsed: cdateResult.unparsed,
          maturityDateUnparsed: false,
          broker: agentCell ? String(agentCell).trim() : null,
        });
      }
    };

    const mainSheet = wb.worksheets[0];
    if (!mainSheet) throw new BadRequestException('That file has no worksheet to read.');
    parseSheet(mainSheet, 3);

    const slrsaSheet = wb.getWorksheet('SLRSA');
    if (slrsaSheet) parseSheet(slrsaSheet, 2);

    // Sheet1: more real Civil Servant Super Savings rows (Sierra Leone
    // Police, per EMI's own confirmation) whose payroll deduction
    // hasn't started yet (targeted September 2026) - most rows here
    // have no policy number assigned yet, which correctly routes them
    // to the review queue rather than creating them outright.
    const sheet1 = wb.getWorksheet('Sheet1');
    if (sheet1) parseSheet(sheet1, 3);

    return rows;
  }

  /**
   * MiMutual Pikin: a child-education product where one parent
   * (the client/policyholder) commonly insures several children, each
   * on its own row. Two real quirks this handles deliberately:
   *
   * 1. A blank "Client Name" cell means "same client as the row
   *    above" - confirmed against the real file (e.g. two consecutive
   *    rows for "Nicolas Rogers", the second with a blank name but a
   *    different Life Assured). These rows share one client record via
   *    clientGroupKey rather than each spawning a duplicate client.
   *
   * 2. The same Policy ID legitimately repeats across those rows
   *    (confirmed: 114 exact repeats in the real file, each with a
   *    different Life Assured and often a different premium) - this is
   *    normal for this product, not a data error like Civil Servant
   *    Super Savings' cross-sheet collisions were. Since one database
   *    policy can only hold one insured life, the first occurrence
   *    keeps the written policy number and each further occurrence
   *    gets a "-2", "-3", ... suffix for system uniqueness, while all
   *    of them share the same client and carry their own Life Assured
   *    into the insured-life field.
   */
  private async parsePikinRoster(buffer: Buffer): Promise<ParsedRosterRow[]> {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as any);
    const ws = wb.worksheets[0];
    if (!ws) throw new BadRequestException('That file has no worksheet to read.');

    const headerRow = ws.getRow(3);
    const colName = findColumnByHeader(headerRow, ['Client Name', 'Client Names']);
    const colDate = findColumnByHeader(headerRow, ['Date']);
    const colPolicyNo = findColumnByHeader(headerRow, ['Policy ID', 'Policy No']);
    const colInstitution = findColumnByHeader(headerRow, ['Institution']);
    const colInsuredName = findColumnByHeader(headerRow, ['Life Assured']);
    const colAgent = findColumnByHeader(headerRow, ['Agent', 'Agent Names']);
    const colCommenceDate = findColumnByHeader(headerRow, ['Commencement Date']);
    const colMaturityDate = findColumnByHeader(headerRow, ['Maturity Date']);
    const colContact = findColumnByHeader(headerRow, ['Contact', 'Contacts']);
    const colPremium = findColumnByHeader(headerRow, ['Premium']);
    if (!colName || !colPolicyNo) throw new BadRequestException('Could not find the expected "Client Name" / "Policy ID" columns in this file.');

    const rows: ParsedRosterRow[] = [];
    const policyNoOccurrences = new Map<string, number>();
    let currentClientName: string | null = null;
    let currentClientGroupKey: string | null = null;
    let groupCounter = 0;

    for (let r = 4; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const nameCell = row.getCell(colName).value;
      const policyNoCell = row.getCell(colPolicyNo).value;
      const insuredNameCell = colInsuredName ? row.getCell(colInsuredName).value : null;
      if (!nameCell && !policyNoCell && !insuredNameCell) continue;

      if (nameCell) {
        currentClientName = String(nameCell).trim();
        groupCounter++;
        currentClientGroupKey = `pikin-group-${groupCounter}`;
      }
      if (!currentClientName) continue; // no client established yet - nothing to attach this row to

      const rawPolicyNo = policyNoCell ? String(policyNoCell).trim() : null;
      let effectivePolicyNo = rawPolicyNo;
      if (rawPolicyNo) {
        const occurrence = (policyNoOccurrences.get(rawPolicyNo) ?? 0) + 1;
        policyNoOccurrences.set(rawPolicyNo, occurrence);
        if (occurrence > 1) effectivePolicyNo = `${rawPolicyNo}-${occurrence}`;
      }

      const cdateResult = colCommenceDate ? parseCssDateCell(row.getCell(colCommenceDate).value) : { date: null, unparsed: false };
      const mdateResult = colMaturityDate ? parseCssDateCell(row.getCell(colMaturityDate).value) : { date: null, unparsed: false };
      const institutionCell = colInstitution ? row.getCell(colInstitution).value : null;
      const agentCell = colAgent ? row.getCell(colAgent).value : null;
      const contactCell = colContact ? row.getCell(colContact).value : null;
      const premiumCell = colPremium ? row.getCell(colPremium).value : null;

      rows.push({
        rowIndex: r,
        statusRaw: null,
        policyNo: effectivePolicyNo,
        name: currentClientName,
        pincode: null, // no pincode column in this roster - staff add it manually for whichever clients pay via Accountant General
        premium: typeof premiumCell === 'number' ? premiumCell : null,
        sumAssured: null,
        designation: institutionCell ? String(institutionCell).trim() : null,
        commencementDate: cdateResult.date,
        maturityDate: mdateResult.date,
        commencementDateUnparsed: cdateResult.unparsed,
        maturityDateUnparsed: mdateResult.unparsed,
        broker: agentCell ? String(agentCell).trim() : null,
        insuredName: insuredNameCell ? String(insuredNameCell).trim() : null,
        phone: contactCell ? String(contactCell).trim() : null,
        clientGroupKey: currentClientGroupKey ?? undefined,
      });
    }
    return rows;
  }

  /**
   * Super Savings Plus: individual clients, no Life Assured column
   * (self-insured), no pincode (paid through other channels per EMI's
   * own confirmation). "Maturity Period" here is a real, populated
   * duration ("3 YEARS" etc.) rather than blank like Civil Servant
   * Super Savings' was, so an actual maturity date is computed from
   * commencement date + that duration rather than left for manual
   * follow-up.
   */
  private async parseSuperSavingsPlusRoster(buffer: Buffer): Promise<ParsedRosterRow[]> {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as any);
    const ws = wb.worksheets[0];
    if (!ws) throw new BadRequestException('That file has no worksheet to read.');

    const headerRow = ws.getRow(3);
    const colName = findColumnByHeader(headerRow, ['Client Names', 'Client Name']);
    const colPolicyNo = findColumnByHeader(headerRow, ['Policy ID', 'Policy No']);
    const colCommenceDate = findColumnByHeader(headerRow, ['Commencement Date']);
    const colInstitution = findColumnByHeader(headerRow, ['Institution']);
    const colAgent = findColumnByHeader(headerRow, ['Agent', 'Agent Names']);
    const colMaturityPeriod = findColumnByHeader(headerRow, ['Maturity Period']);
    const colContact = findColumnByHeader(headerRow, ['Contacts', 'Contact']);
    const colPremium = findColumnByHeader(headerRow, ['Premium']);
    if (!colName || !colPolicyNo) throw new BadRequestException('Could not find the expected "Client Names" / "Policy ID" columns in this file.');

    const rows: ParsedRosterRow[] = [];
    for (let r = 4; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const nameCell = row.getCell(colName).value;
      if (!nameCell) continue;

      const policyNoCell = row.getCell(colPolicyNo).value;
      const cdateResult = colCommenceDate ? parseCssDateCell(row.getCell(colCommenceDate).value) : { date: null, unparsed: false };
      const institutionCell = colInstitution ? row.getCell(colInstitution).value : null;
      const agentCell = colAgent ? row.getCell(colAgent).value : null;
      const maturityPeriodCell = colMaturityPeriod ? row.getCell(colMaturityPeriod).value : null;
      const contactCell = colContact ? row.getCell(colContact).value : null;
      const premiumCell = colPremium ? row.getCell(colPremium).value : null;

      let maturityDate: string | null = null;
      let maturityDateUnparsed = false;
      if (maturityPeriodCell) {
        const years = parseYearsDuration(String(maturityPeriodCell));
        if (years && cdateResult.date) maturityDate = addYearsToDate(cdateResult.date, years);
        else if (years === null) maturityDateUnparsed = true;
      }

      rows.push({
        rowIndex: r,
        statusRaw: null,
        policyNo: policyNoCell ? String(policyNoCell).trim() : null,
        name: String(nameCell).trim(),
        pincode: null,
        premium: typeof premiumCell === 'number' ? premiumCell : null,
        sumAssured: null,
        designation: institutionCell ? String(institutionCell).trim() : null,
        commencementDate: cdateResult.date,
        maturityDate,
        commencementDateUnparsed: cdateResult.unparsed,
        maturityDateUnparsed,
        broker: agentCell ? String(agentCell).trim() : null,
        phone: contactCell ? String(contactCell).trim() : null,
      });
    }
    return rows;
  }

  async importRoster(
    buffer: Buffer,
    productId: string,
    fileName: string,
    actor: AuthenticatedUser,
    format: 'pay_smol_smol' | 'css' | 'pikin' | 'super_savings_plus' = 'pay_smol_smol',
  ): Promise<{ created: number; flagged: number; skippedAlreadyImported: number; skippedAlreadyFlagged: number }> {
    const product = await this.productsRepo.findOne({ where: { id: productId } });
    if (!product) throw new NotFoundException('Product not found');

    const rows =
      format === 'css' ? await this.parseCssRoster(buffer)
      : format === 'pikin' ? await this.parsePikinRoster(buffer)
      : format === 'super_savings_plus' ? await this.parseSuperSavingsPlusRoster(buffer)
      : await this.parsePaySmolSmolRoster(buffer);

    const policyNoCounts = new Map<string, number>();
    const pincodeCounts = new Map<string, number>();
    rows.forEach((r) => {
      if (r.policyNo) policyNoCounts.set(r.policyNo, (policyNoCounts.get(r.policyNo) ?? 0) + 1);
      if (r.pincode) pincodeCounts.set(r.pincode, (pincodeCounts.get(r.pincode) ?? 0) + 1);
    });

    const existingPolicyNos = new Set((await this.policiesRepo.find({ select: ['policyNo'] })).map((p) => p.policyNo));
    const existingPinCodes = new Set(
      (await this.policiesRepo.find({ select: ['payrollPinCode'] })).map((p) => p.payrollPinCode).filter((x): x is string => !!x),
    );

    // A row that was already flagged in a previous upload (and hasn't
    // been resolved or dismissed yet) shouldn't be flagged again as a
    // brand new issue - it's the same real-world problem, still
    // waiting on the same fix. Matched by policy number when the row
    // has one, otherwise by pincode+name as the best available
    // fingerprint for a row that's missing a policy number entirely.
    const pendingIssues = await this.issuesRepo.find({ where: { productId, status: 'Pending' } });
    const existingPendingByPolicyNo = new Set(
      pendingIssues.map((i) => i.rawData?.policyNo).filter((x): x is string => !!x),
    );
    const existingPendingByPincodeName = new Set(
      pendingIssues.filter((i) => !i.rawData?.policyNo).map((i) => `${i.rawData?.pincode ?? ''}::${i.rawData?.name ?? ''}`),
    );

    let created = 0;
    let flagged = 0;
    let skippedAlreadyImported = 0;
    let skippedAlreadyFlagged = 0;
    const groupKeyToClient = new Map<string, ClientEntity>();

    for (const row of rows) {
      if (row.policyNo && existingPolicyNos.has(row.policyNo)) {
        skippedAlreadyImported++;
        continue;
      }
      const alreadyPending = row.policyNo
        ? existingPendingByPolicyNo.has(row.policyNo)
        : existingPendingByPincodeName.has(`${row.pincode ?? ''}::${row.name}`);
      if (alreadyPending) {
        skippedAlreadyFlagged++;
        continue;
      }

      const issueTypes: string[] = [];
      const issueDetails: string[] = [];

      if (!row.policyNo) {
        issueTypes.push('missing_policy_number');
        issueDetails.push('No policy number was given for this row.');
      }
      if (row.policyNo && (policyNoCounts.get(row.policyNo) ?? 0) > 1) {
        issueTypes.push('duplicate_policy_number');
        issueDetails.push(`Policy number ${row.policyNo} appears more than once in this file.`);
      }
      if (row.pincode && ((pincodeCounts.get(row.pincode) ?? 0) > 1 || existingPinCodes.has(row.pincode))) {
        issueTypes.push('duplicate_pincode');
        issueDetails.push(`Pincode ${row.pincode} is used by more than one policy.`);
      }
      if (row.commencementDateUnparsed) {
        issueTypes.push('unparseable_commencement_date');
        issueDetails.push('Commencement date could not be read from the file.');
      }
      if (row.maturityDateUnparsed) {
        issueTypes.push('unparseable_maturity_date');
        issueDetails.push('Maturity date could not be read from the file.');
      }

      if (issueTypes.length > 0) {
        await this.issuesRepo.save(
          this.issuesRepo.create({
            productId, rawData: row as any, issueTypes, issueDetails: issueDetails.join(' '),
            status: 'Pending', sourceFileName: fileName,
          }),
        );
        flagged++;
        continue;
      }

      let client: ClientEntity;
      const existingGroupClient = row.clientGroupKey ? groupKeyToClient.get(row.clientGroupKey) : undefined;
      if (existingGroupClient) {
        client = existingGroupClient;
      } else {
        client = await this.clientsService.create({
          fullName: row.name,
          phone: row.phone || 'Not on file',
          employerOrGroup: row.designation ?? undefined,
          smsConsent: false,
        });
        if (row.clientGroupKey) groupKeyToClient.set(row.clientGroupKey, client);
      }
      await this.policiesRepo.save(
        this.policiesRepo.create({
          policyNo: row.policyNo as string,
          client,
          product,
          sumAssured: (row.sumAssured ?? 0).toFixed(2),
          monthlyPremium: (row.premium ?? 0).toFixed(2),
          commencementDate: row.commencementDate ?? new Date().toISOString().slice(0, 10),
          maturityDate: row.maturityDate,
          paymentMethod: 'Payroll Deduction',
          status: row.statusRaw === 'Stop' ? 'Cancelled' : 'Active',
          payrollPinCode: row.pincode,
          brokerName: row.broker,
          insuredName: row.insuredName ?? null,
        }),
      );
      existingPolicyNos.add(row.policyNo as string);
      if (row.pincode) existingPinCodes.add(row.pincode);
      created++;
    }

    return { created, flagged, skippedAlreadyImported, skippedAlreadyFlagged };
  }

  async listIssues(productId: string, status?: string): Promise<RosterImportIssueEntity[]> {
    return this.issuesRepo.find({
      where: { productId, ...(status ? { status: status as any } : {}) },
      order: { createdAt: 'ASC' },
    });
  }

  async resolveIssue(
    issueId: string,
    fields: {
      policyNo: string; name: string; pincode?: string; premium: number; sumAssured?: number;
      designation?: string; commencementDate: string; maturityDate?: string; status: 'Active' | 'Cancelled';
      broker?: string; phone?: string;
    },
    actor: AuthenticatedUser,
  ): Promise<PolicyEntity> {
    const issue = await this.issuesRepo.findOne({ where: { id: issueId } });
    if (!issue) throw new NotFoundException('Import issue not found');
    if (issue.status !== 'Pending') throw new BadRequestException('This issue has already been resolved or dismissed.');

    const existing = await this.policiesRepo.findOne({ where: { policyNo: fields.policyNo } });
    if (existing) throw new BadRequestException(`Policy number ${fields.policyNo} is already in use - choose a different one.`);

    const product = await this.productsRepo.findOne({ where: { id: issue.productId } });
    if (!product) throw new NotFoundException('Product not found');

    const client = await this.clientsService.create({
      fullName: fields.name, phone: fields.phone || 'Not on file',
      employerOrGroup: fields.designation ?? undefined, smsConsent: false,
    });
    const policy = await this.policiesRepo.save(
      this.policiesRepo.create({
        policyNo: fields.policyNo, client, product,
        sumAssured: (fields.sumAssured ?? 0).toFixed(2), monthlyPremium: fields.premium.toFixed(2),
        commencementDate: fields.commencementDate, maturityDate: fields.maturityDate ?? null,
        paymentMethod: 'Payroll Deduction', status: fields.status,
        payrollPinCode: fields.pincode ?? null, brokerName: fields.broker ?? null,
      }),
    );

    await this.issuesRepo.update(issueId, {
      status: 'Resolved', resolvedPolicyId: policy.id, resolvedBy: actor.id, resolvedAt: new Date(),
    });
    return policy;
  }

  async dismissIssue(issueId: string, actor: AuthenticatedUser): Promise<void> {
    const issue = await this.issuesRepo.findOne({ where: { id: issueId } });
    if (!issue) throw new NotFoundException('Import issue not found');
    if (issue.status !== 'Pending') throw new BadRequestException('This issue has already been resolved or dismissed.');
    await this.issuesRepo.update(issueId, { status: 'Dismissed', resolvedBy: actor.id, resolvedAt: new Date() });
  }
}
