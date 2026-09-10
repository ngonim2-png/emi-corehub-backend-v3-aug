import { BadRequestException, Body, Controller, Get, Param, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import * as XLSX from 'xlsx';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuditLog } from '../../common/decorators/audit-log.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { JournalService } from './journal.service';
import { PostJournalEntryDto } from './dto/post-journal-entry.dto';
import { buildExcelExport } from '../../common/utils/excel-export.util';
import { sendExcelFile } from '../../common/utils/send-excel-file.util';

const MAX_JOURNAL_UPLOAD_BYTES = 10 * 1024 * 1024;

/**
 * EMI's real General Ledger export: one sheet per month, each sheet
 * tracking a single account's running balance (a cash book) rather
 * than pre-paired debit/credit rows. Every row is one side of a
 * transaction against a listed GL code; the other side - the cash/bank
 * account this whole ledger is tracking - is implied, never written
 * down, so it has to be supplied explicitly by whoever uploads the
 * file rather than guessed. Date is often blank on rows after the
 * first transaction of a given day and carries forward from the last
 * seen date, confirmed against the real file. "Bal. B/F" rows are the
 * month's opening balance, not a real transaction, and are skipped.
 */
async function parseGeneralLedgerFile(
  buffer: Buffer,
  cashAccountCode: string,
): Promise<{ rows: { date: string; narration: string; debitAccountCode: string; creditAccountCode: string; amount: number }[]; skippedNoDate: number }> {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  if (wb.SheetNames.length === 0) throw new BadRequestException('That file has no worksheets to read.');

  const rows: { date: string; narration: string; debitAccountCode: string; creditAccountCode: string; amount: number }[] = [];
  let skippedNoDate = 0;
  const num = (v: any): number => {
    if (v === null || v === undefined || v === '') return NaN;
    return typeof v === 'number' ? v : parseFloat(String(v));
  };
  const MONTHS: Record<string, number> = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8,
    sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
  };
  /**
   * Handles both real date cells (most months) and the text format
   * confirmed in later months of the real file - "1-Sept-2026" style,
   * with "Sept" rather than the standard three-letter "Sep".
   */
  const parseCellDate = (cell: any): string | null => {
    if (cell instanceof Date) return cell.toISOString().slice(0, 10);
    if (!cell) return null;
    const text = String(cell).trim();
    const m = text.match(/^(\d{1,2})-([A-Za-z]+)-(\d{4})$/);
    if (!m) return null;
    const day = parseInt(m[1], 10);
    const monthNum = MONTHS[m[2].toLowerCase().slice(0, 4)] ?? MONTHS[m[2].toLowerCase().slice(0, 3)];
    if (!monthNum) return null;
    return `${m[3]}-${String(monthNum).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  };

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const sheetRows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });

    let headerRowIdx = -1;
    let col: Record<string, number> = {};
    for (let i = 0; i < Math.min(sheetRows.length, 6); i++) {
      const row = sheetRows[i];
      if (!row) continue;
      const candidate: Record<string, number> = {};
      row.forEach((cell, idx) => { if (cell) candidate[String(cell).trim().toLowerCase()] = idx; });
      if (candidate['date'] !== undefined && candidate['gl code'] !== undefined) {
        col = candidate;
        headerRowIdx = i;
        break;
      }
    }
    if (headerRowIdx === -1) continue; // not a real ledger sheet (e.g. an empty future month) - skip quietly

    const cDate = col['date'];
    const cGlCode = col['gl code'];
    const cDesc = col['description'];
    const cDebit = col['debit'];
    const cCredit = col['credit'];

    let lastDate: string | null = null;
    for (let i = headerRowIdx + 1; i < sheetRows.length; i++) {
      const row = sheetRows[i];
      if (!row) continue;
      const glCodeCell = row[cGlCode];
      const descCell = row[cDesc];

      const dateCell = row[cDate];
      const rowDate = parseCellDate(dateCell);
      if (rowDate) lastDate = rowDate;
      if (!glCodeCell) continue; // "Bal. B/F" and blank rows have no GL code - not a real transaction, but their date (if any) still carries forward
      if (!lastDate) { skippedNoDate++; continue; } // no date established yet for this sheet - can't post without one

      const debit = num(row[cDebit]);
      const credit = num(row[cCredit]);
      const amount = !isNaN(debit) && debit > 0 ? debit : (!isNaN(credit) && credit > 0 ? credit : 0);
      if (amount === 0) continue;

      const glCode = String(glCodeCell).trim();

      // The row's own account takes whichever side the file shows; the
      // cash/bank contra-account takes the opposite side, for the same
      // amount, keeping every entry balanced.
      rows.push({
        date: lastDate,
        narration: descCell ? String(descCell).trim() : '(no description)',
        debitAccountCode: !isNaN(debit) && debit > 0 ? glCode : cashAccountCode,
        creditAccountCode: !isNaN(debit) && debit > 0 ? cashAccountCode : glCode,
        amount,
      });
    }
  }
  return { rows, skippedNoDate };
}

@Controller('journal-entries')
export class JournalController {
  constructor(private readonly journalService: JournalService) {}

  @Get()
  async findRecent(
    @Query('limit') limit?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.journalService.findRecent(limit ? parseInt(limit, 10) : undefined, from, to);
  }

  // Note: no @AuditLog decorator here - JournalService.post() already
  // writes its own audit entry atomically inside the same transaction as
  // the posting. Stacking the decorator on top (as this route used to
  // have) silently doubled every journal-entry audit record - the same
  // maker/checker-adjacent mistake caught and fixed on policy
  // reinstatement and renewal earlier in this build.
  @Post()
  @Roles('Super Admin', 'Finance Manager')
  async post(@Body() dto: PostJournalEntryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.journalService.post(dto.date, dto.narration, dto.lines, 'manual', null, user);
  }

  @Post(':id/approve')
  @Roles('Super Admin', 'Finance Manager')
  async approve(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.journalService.approve(id, user);
  }

  @Post(':id/reverse')
  @Roles('Super Admin', 'Finance Manager')
  async reverse(
    @Param('id') id: string,
    @Body('narration') narration: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.journalService.reverse(id, narration, user);
  }

  @Get('export')
  @Roles('Super Admin', 'Finance Manager')
  async exportEntries(@Query('from') from: string, @Query('to') to: string, @Res() res: Response) {
    const entries = await this.journalService.findRecent(100000, from, to);
    const rows: Record<string, string | number | null>[] = [];
    for (const entry of entries) {
      for (const line of entry.lines || []) {
        rows.push({
          entryNo: entry.entryNo, date: entry.date, narration: entry.narration, status: entry.status,
          accountCode: line.account?.code ?? '', accountName: line.account?.name ?? '',
          debit: Number(line.debit) || 0, credit: Number(line.credit) || 0,
        });
      }
    }
    const buffer = await buildExcelExport(
      'Journal & Ledger',
      [
        { header: 'Entry No.', key: 'entryNo', width: 14 },
        { header: 'Date', key: 'date', width: 12 },
        { header: 'Narration', key: 'narration', width: 32 },
        { header: 'Status', key: 'status', width: 16 },
        { header: 'Account code', key: 'accountCode', width: 12 },
        { header: 'Account name', key: 'accountName', width: 26 },
        { header: 'Debit', key: 'debit', width: 14, numeric: true },
        { header: 'Credit', key: 'credit', width: 14, numeric: true },
      ],
      rows,
      `Journal & Ledger${from ? ` — ${from} to ${to || 'present'}` : ''}`,
    );
    sendExcelFile(res, buffer, `journal-ledger${from ? `-${from}-to-${to || 'now'}` : ''}.xlsx`);
  }

  @Get('periods/closed')
  async closedPeriods(@Query('month') month?: string) {
    return this.journalService.findClosedPeriods(month);
  }

  @Get('periods/closed/export')
  @Roles('Super Admin', 'Finance Manager')
  async exportClosedPeriods(@Query('month') month: string | undefined, @Res() res: Response) {
    const periods = await this.journalService.findClosedPeriods(month);
    const buffer = await buildExcelExport(
      'Closed Periods',
      [
        { header: 'Period', key: 'period', width: 12 },
        { header: 'Closed', key: 'closedAt', width: 16 },
        { header: 'Closed by', key: 'closedBy', width: 20 },
        { header: 'Notes', key: 'notes', width: 32 },
      ],
      periods.map((p) => ({ period: p.period, closedAt: p.closedAt.toISOString().slice(0, 10), closedBy: p.closedBy ?? '', notes: p.notes ?? '' })),
      'Closed Periods',
    );
    sendExcelFile(res, buffer, 'closed-periods.xlsx');
  }

  @Post('bulk-upload')
  @Roles('Super Admin', 'Finance Manager')
  @AuditLog({ action: 'journal.bulk_historical_upload', entityType: 'journal_entry' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_JOURNAL_UPLOAD_BYTES } }))
  async bulkUpload(
    @UploadedFile() file: Express.Multer.File,
    @Body('cashAccountCode') cashAccountCode: string | undefined,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    if (!file) throw new BadRequestException('No file was uploaded.');
    const code = cashAccountCode || '1000';
    const { rows, skippedNoDate } = await parseGeneralLedgerFile(file.buffer, code);
    if (rows.length === 0) {
      throw new BadRequestException('No valid rows were found - check this is a real General Ledger export with Date, GL Code, Description, Debit, and Credit columns.');
    }
    const result = await this.journalService.bulkUploadHistoricalEntries(rows, actor);
    return { ...result, skippedNoDate };
  }

  @Post('periods/:period/close')
  @Roles('Super Admin', 'Finance Manager')
  async closePeriod(
    @Param('period') period: string,
    @Body('notes') notes: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.journalService.closePeriod(period, user, notes);
  }
}
