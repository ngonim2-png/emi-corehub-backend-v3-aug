import { BadRequestException, Body, Controller, Get, Param, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import * as ExcelJS from 'exceljs';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuditLog } from '../../common/decorators/audit-log.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { JournalService } from './journal.service';
import { PostJournalEntryDto } from './dto/post-journal-entry.dto';
import { buildExcelExport } from '../../common/utils/excel-export.util';
import { sendExcelFile } from '../../common/utils/send-excel-file.util';

const MAX_JOURNAL_UPLOAD_BYTES = 10 * 1024 * 1024;

/**
 * Standard template for backfilling historical journal entries: Date,
 * Narration, Debit Account Code, Credit Account Code, Amount - one row
 * per simple two-line entry, matched by header label like every other
 * bulk import in this system.
 */
async function parseHistoricalJournalFile(
  buffer: Buffer,
): Promise<{ date: string; narration: string; debitAccountCode: string; creditAccountCode: string; amount: number }[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as any);
  const ws = wb.worksheets[0];
  if (!ws) throw new BadRequestException('That file has no worksheet to read.');
  const headerRow = ws.getRow(1);
  const col: Record<string, number> = {};
  for (let c = 1; c <= headerRow.cellCount; c++) {
    const v = headerRow.getCell(c).value;
    if (v) col[String(v).trim().toLowerCase()] = c;
  }
  const cDate = col['date'];
  const cNarr = col['narration'];
  const cDebit = col['debit account code'] ?? col['debit account'];
  const cCredit = col['credit account code'] ?? col['credit account'];
  const cAmount = col['amount'];
  if (!cDate || !cNarr || !cDebit || !cCredit || !cAmount) {
    throw new BadRequestException(
      'Expected columns "Date", "Narration", "Debit Account Code", "Credit Account Code", and "Amount" were not found.',
    );
  }
  const rows: { date: string; narration: string; debitAccountCode: string; creditAccountCode: string; amount: number }[] = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const dateCell = row.getCell(cDate).value;
    const narrCell = row.getCell(cNarr).value;
    if (!dateCell || !narrCell) continue;
    const date = dateCell instanceof Date ? dateCell.toISOString().slice(0, 10) : String(dateCell).trim();
    const amountCell = row.getCell(cAmount).value;
    const amount = typeof amountCell === 'number' ? amountCell : parseFloat(String(amountCell));
    rows.push({
      date, narration: String(narrCell).trim(),
      debitAccountCode: String(row.getCell(cDebit).value ?? '').trim(),
      creditAccountCode: String(row.getCell(cCredit).value ?? '').trim(),
      amount: isNaN(amount) ? 0 : amount,
    });
  }
  return rows;
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
  async bulkUpload(@UploadedFile() file: Express.Multer.File, @CurrentUser() actor: AuthenticatedUser) {
    if (!file) throw new BadRequestException('No file was uploaded.');
    const rows = await parseHistoricalJournalFile(file.buffer);
    if (rows.length === 0) {
      throw new BadRequestException('No valid rows were found - check the file has Date, Narration, Debit Account Code, Credit Account Code, and Amount columns.');
    }
    return this.journalService.bulkUploadHistoricalEntries(rows, actor);
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
