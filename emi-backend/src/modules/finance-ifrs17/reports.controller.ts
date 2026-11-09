import { BadRequestException, Body, Controller, Get, Param, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as ExcelJS from 'exceljs';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuditLog } from '../../common/decorators/audit-log.decorator';
import { JournalService } from './journal.service';
import { FinancialReportsService } from './financial-reports.service';
import { ChartOfAccountEntity } from './entities/chart-of-account.entity';
import { Ifrs17GroupEntity } from './entities/ifrs17-group.entity';
import { Ifrs17MeasurementEntity } from './entities/ifrs17-measurement.entity';
import { buildExcelExport } from '../../common/utils/excel-export.util';
import { sendExcelFile } from '../../common/utils/send-excel-file.util';

const MAX_COA_BYTES = 5 * 1024 * 1024;

/**
 * Standard bulk-upload format for the chart of accounts, used for both
 * the original real chart-of-accounts import and any future update -
 * this is a fixed, documented template (not a one-off parser for a
 * single messy file), matched by header label so column order doesn't
 * matter: Account Code, Account Name, Type (Asset/Liability/Equity/
 * Income/Expense), Description (optional).
 */
async function parseAccountsFile(buffer: Buffer): Promise<{ code: string; name: string; type: string; description?: string }[]> {
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
  const cCode = col['account code'] ?? col['code'];
  const cName = col['account name'] ?? col['name'];
  const cType = col['type'];
  const cDesc = col['description'];
  if (!cCode || !cName || !cType) {
    throw new BadRequestException('Expected columns "Account Code", "Account Name", and "Type" (Description is optional) were not found.');
  }
  const rows: { code: string; name: string; type: string; description?: string }[] = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const codeCell = row.getCell(cCode).value;
    const nameCell = row.getCell(cName).value;
    if (!codeCell || !nameCell) continue;
    rows.push({
      code: String(codeCell).trim(),
      name: String(nameCell).trim(),
      type: String(row.getCell(cType).value ?? '').trim(),
      description: cDesc ? String(row.getCell(cDesc).value ?? '').trim() || undefined : undefined,
    });
  }
  return rows;
}

@Controller()
export class ReportsController {
  constructor(
    private readonly journalService: JournalService,
    private readonly financialReportsService: FinancialReportsService,
    @InjectRepository(ChartOfAccountEntity)
    private readonly accountsRepo: Repository<ChartOfAccountEntity>,
    @InjectRepository(Ifrs17GroupEntity)
    private readonly ifrs17GroupsRepo: Repository<Ifrs17GroupEntity>,
    @InjectRepository(Ifrs17MeasurementEntity)
    private readonly ifrs17MeasurementsRepo: Repository<Ifrs17MeasurementEntity>,
  ) {}

  @Get('accounts')
  async listAccounts() {
    return this.accountsRepo.find({ order: { code: 'ASC' } });
  }

  @Get('accounts/export')
  @Roles('Super Admin', 'Finance Manager')
  async exportAccounts(@Res() res: Response) {
    const accounts = await this.accountsRepo.find({ order: { code: 'ASC' } });
    const buffer = await buildExcelExport(
      'Chart of Accounts',
      [
        { header: 'Account Code', key: 'code', width: 14 },
        { header: 'Account Name', key: 'name', width: 32 },
        { header: 'Type', key: 'type', width: 12 },
        { header: 'Description', key: 'description', width: 44 },
      ],
      accounts.map((a) => ({ code: a.code, name: a.name, type: a.type, description: a.description ?? '' })),
      'Chart of Accounts',
    );
    sendExcelFile(res, buffer, 'chart-of-accounts.xlsx');
  }

  @Post('accounts/bulk-import')
  @Roles('Super Admin', 'Finance Manager')
  @AuditLog({ action: 'chart_of_accounts.bulk_imported', entityType: 'chart_of_account' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_COA_BYTES } }))
  async bulkImportAccounts(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file was uploaded.');
    const rows = await parseAccountsFile(file.buffer);
    if (rows.length === 0) {
      throw new BadRequestException('No valid rows were found - check the file has "Account Code", "Account Name", and "Type" columns.');
    }
    return this.financialReportsService.bulkImportAccounts(rows);
  }

  @Get('reports/trial-balance')
  async trialBalance(@Query('from') from?: string, @Query('to') to?: string) {
    return this.journalService.trialBalance(from, to);
  }

  @Get('reports/trial-balance/export')
  @Roles('Super Admin', 'Finance Manager')
  async exportTrialBalance(@Query('from') from: string, @Query('to') to: string, @Res() res: Response) {
    const rows = await this.journalService.trialBalance(from, to);
    const buffer = await buildExcelExport(
      'Trial Balance',
      [
        { header: 'Account code', key: 'code', width: 12 },
        { header: 'Account name', key: 'name', width: 30 },
        { header: 'Debit', key: 'debit', width: 16, numeric: true },
        { header: 'Credit', key: 'credit', width: 16, numeric: true },
      ],
      rows,
      `Trial Balance${from ? ` — ${from} to ${to || 'present'}` : ''}`,
    );
    sendExcelFile(res, buffer, `trial-balance${from ? `-${from}-to-${to || 'now'}` : ''}.xlsx`);
  }

  @Get('accounts/:code/ledger')
  async accountLedger(
    @Param('code') code: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.journalService.accountLedger(code, from, to);
  }

  @Get('ifrs17/groups')
  async ifrs17Groups() {
    return this.ifrs17GroupsRepo.find({ relations: ['product'] });
  }

  @Get('ifrs17/measurements')
  async ifrs17Measurements() {
    return this.ifrs17MeasurementsRepo.find({
      relations: ['group', 'group.product'],
      order: { computedAt: 'DESC' },
      take: 100,
    });
  }
}
