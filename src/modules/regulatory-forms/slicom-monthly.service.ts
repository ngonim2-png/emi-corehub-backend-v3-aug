import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as ExcelJS from 'exceljs';
import * as path from 'path';
import { PaymentEntity } from '../field-collection-wallet/entities/payment.entity';
import { ClaimEntity } from '../claims/entities/claim.entity';
import { UserEntity } from '../identity-access/entities/user.entity';

const TEMPLATE_PATH = path.join(__dirname, '..', '..', 'assets', 'slicom-monthly-template.xlsx');
const COMPANY_NAME = 'Enhanced Mutual Insurance (SL) Ltd'; // matches /settings/business-rules - keep these in sync if either changes

interface SheetLayout {
  sheetName: string;
  headerRow: number;
  firstDataRow: number;
  lastTemplateDataRow: number;
  footerRow: number;
  numCols: number;
}

const SHEET1_PREMIUM: SheetLayout = { sheetName: 'Sheet1', headerRow: 5, firstDataRow: 6, lastTemplateDataRow: 15, footerRow: 16, numCols: 7 };
const SHEET2_OUTSTANDING: SheetLayout = { sheetName: 'Sheet2', headerRow: 5, firstDataRow: 6, lastTemplateDataRow: 19, footerRow: 20, numCols: 9 };
const SHEET3_PAID: SheetLayout = { sheetName: 'Sheet3', headerRow: 5, firstDataRow: 6, lastTemplateDataRow: 18, footerRow: 19, numCols: 8 };

const MONTH_NAMES = [
  'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
  'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER',
];

const MAX_REPORT_ROWS = 10000;

@Injectable()
export class SlicomMonthlyService {
  constructor(
    @InjectRepository(PaymentEntity) private readonly paymentsRepo: Repository<PaymentEntity>,
    @InjectRepository(ClaimEntity) private readonly claimsRepo: Repository<ClaimEntity>,
    @InjectRepository(UserEntity) private readonly usersRepo: Repository<UserEntity>,
  ) {}

  /**
   * Inserts extra rows before a sheet's footer if the real data outgrows
   * the template's pre-built blank rows, cloning style from firstDataRow
   * (verified to carry the template's actual borders/font - a couple of
   * rows near this template's own footer do not, so that row is
   * deliberately not used as the style source).
   */
  private getRequiredWorksheet(workbook: ExcelJS.Workbook, sheetName: string): ExcelJS.Worksheet {
    const ws = workbook.getWorksheet(sheetName);
    if (!ws) {
      throw new Error(
        `SLICOM template is missing expected sheet "${sheetName}" - the template asset may have been replaced or corrupted.`,
      );
    }
    return ws;
  }

  private ensureRowCapacity(ws: ExcelJS.Worksheet, layout: SheetLayout, neededRows: number): number {
    if (neededRows > MAX_REPORT_ROWS) {
      throw new BadRequestException(
        `This report would need ${neededRows} rows on "${layout.sheetName}", which is far beyond what a real month's data should produce - ` +
          'this points to something else being wrong (an incorrect period, a duplicate-data issue) rather than a genuinely large month. ' +
          'Please check the data for this period before retrying.',
      );
    }
    const available = layout.lastTemplateDataRow - layout.firstDataRow + 1;
    if (neededRows <= available) return layout.footerRow;
    const extra = neededRows - available;
    const styleRow = ws.getRow(layout.firstDataRow);
    ws.spliceRows(layout.footerRow, 0, ...Array.from({ length: extra }, () => []));
    for (let i = 0; i < extra; i++) {
      const newRow = ws.getRow(layout.footerRow + i);
      for (let c = 1; c <= layout.numCols; c++) {
        newRow.getCell(c).style = JSON.parse(JSON.stringify(styleRow.getCell(c).style));
      }
      newRow.height = styleRow.height;
    }
    return layout.footerRow + extra;
  }

  private writeRows(ws: ExcelJS.Worksheet, layout: SheetLayout, rows: (string | number)[][]): void {
    this.ensureRowCapacity(ws, layout, rows.length);
    rows.forEach((rowData, i) => {
      const r = ws.getRow(layout.firstDataRow + i);
      rowData.forEach((val, c) => {
        r.getCell(c + 1).value = val;
      });
    });
  }

  private setTitleAndCompany(ws: ExcelJS.Worksheet, monthLabel: string): void {
    const titleCell = ws.getCell('A4');
    const original = String(titleCell.value ?? '');
    // Preserve the template's own title text (including its line break for
    // Sheet2's two-line title) but replace the trailing hardcoded "2025"
    // with the real reporting period.
    titleCell.value = original.replace(/\d{4}/, monthLabel);

    const companyCell = ws.getCell('A3');
    companyCell.value = `NAME OF COMPANY: ${COMPANY_NAME}`;
  }

  private marketerName(marketerId: string | null, marketerNames: Map<string, string>): string {
    if (!marketerId) return '';
    return marketerNames.get(marketerId) ?? '';
  }

  async generate(period: string): Promise<Buffer> {
    if (!/^\d{4}-\d{2}$/.test(period)) {
      throw new BadRequestException('period must be in YYYY-MM format');
    }
    const [yearStr, monthStr] = period.split('-');
    const year = Number(yearStr);
    const monthIndex = Number(monthStr) - 1;
    if (monthIndex < 0 || monthIndex > 11) throw new BadRequestException('Invalid month in period');
    const monthLabel = `${MONTH_NAMES[monthIndex]} ${year}`;
    const periodStart = `${period}-01`;
    const periodEndDate = new Date(year, monthIndex + 1, 0); // last real day of the month, handles Feb/30-vs-31 correctly
    const periodEnd = periodEndDate.toISOString().slice(0, 10);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(TEMPLATE_PATH);

    const marketers = await this.usersRepo.find({ relations: ['role'] });
    const marketerNames = new Map(marketers.map((u) => [u.id, u.fullName]));

    // ---------- Sheet1: Premium Collection ----------
    const payments = await this.paymentsRepo
      .createQueryBuilder('payment')
      .innerJoinAndSelect('payment.policy', 'policy')
      .innerJoinAndSelect('policy.client', 'client')
      .where('payment.paymentMonth = :period', { period })
      .andWhere('payment.reversalStatus != :reversed', { reversed: 'Reversed' })
      .andWhere('payment.amount > 0')
      .orderBy('payment.createdAt', 'ASC')
      .getMany();

    const ws1 = this.getRequiredWorksheet(workbook, SHEET1_PREMIUM.sheetName);
    this.setTitleAndCompany(ws1, monthLabel);
    this.writeRows(
      ws1,
      SHEET1_PREMIUM,
      payments.map((p) => [
        p.policy.client.fullName,
        p.policy.policyNo,
        p.policy.client.employerOrGroup || '',
        p.paymentMethod,
        this.marketerName(p.marketerId, marketerNames),
        Number(p.amount),
        '',
      ]),
    );

    // ---------- Sheet2: Claims Outstanding ----------
    // "Outstanding as of period end" is approximated as: reported on or
    // before the period's last day, and not yet in a terminal state
    // (Paid/Rejected) as of when this report is generated. This system
    // doesn't keep a historical claim-status snapshot per day, so a claim
    // that was outstanding mid-period but got paid before this report was
    // run will correctly show up in Sheet3 instead - it won't double-count,
    // but it also won't appear "outstanding" here if you regenerate an old
    // period's report after the fact.
    const outstandingClaims = await this.claimsRepo
      .createQueryBuilder('claim')
      .innerJoinAndSelect('claim.policy', 'policy')
      .innerJoinAndSelect('policy.client', 'client')
      .where('claim.dateReported <= :end', { end: periodEnd })
      .andWhere('claim.status IN (:...statuses)', { statuses: ['Registered', 'Under Review', 'Approved'] })
      .orderBy('claim.dateReported', 'ASC')
      .getMany();

    const ws2 = this.getRequiredWorksheet(workbook, SHEET2_OUTSTANDING.sheetName);
    this.setTitleAndCompany(ws2, monthLabel);
    this.writeRows(
      ws2,
      SHEET2_OUTSTANDING,
      outstandingClaims.map((c) => [
        c.policy.client.fullName,
        c.policy.policyNo,
        c.claimType,
        c.policy.client.employerOrGroup || '',
        Number(c.policy.sumAssured),
        Number(c.reserveAmount) > 0 ? Number(c.reserveAmount) : Number(c.amountClaimed),
        '', // DUE DATE OF PAYMENT - not a field this system tracks; left for the claims team to annotate by hand
        '',
        '',
      ]),
    );

    // ---------- Sheet3: Claims Paid ----------
    const paidClaims = await this.claimsRepo
      .createQueryBuilder('claim')
      .innerJoinAndSelect('claim.policy', 'policy')
      .innerJoinAndSelect('policy.client', 'client')
      .where('claim.status = :status', { status: 'Paid' })
      .andWhere('claim.datePaid >= :start', { start: periodStart })
      .andWhere('claim.datePaid <= :end', { end: periodEnd })
      .orderBy('claim.datePaid', 'ASC')
      .getMany();

    const ws3 = this.getRequiredWorksheet(workbook, SHEET3_PAID.sheetName);
    this.setTitleAndCompany(ws3, monthLabel);
    this.writeRows(
      ws3,
      SHEET3_PAID,
      paidClaims.map((c) => [
        c.policy.client.fullName,
        c.claimNo,
        c.policy.policyNo,
        c.claimType,
        Number(c.amountApproved ?? c.amountClaimed),
        c.datePaid ?? '',
        c.paymentMethod ?? '',
        '',
      ]),
    );

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
  }
}
