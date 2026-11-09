import { BadRequestException, Body, Controller, Get, Param, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import * as ExcelJS from 'exceljs';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuditLog } from '../../common/decorators/audit-log.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { IdempotencyKey } from '../../common/decorators/idempotency-key.decorator';
import { IdempotencyInterceptor } from '../../common/interceptors/idempotency.interceptor';
import { PaymentsService } from './payments.service';
import { PostPaymentDto } from './dto/post-payment.dto';
import { buildExcelExport } from '../../common/utils/excel-export.util';
import { sendExcelFile } from '../../common/utils/send-excel-file.util';

const MAX_PAYMENT_UPLOAD_BYTES = 10 * 1024 * 1024;

const MONTH_NAME_TO_NUM: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

/**
 * The real payment-mode values seen in EMI's own premium payment hub
 * file, mapped to this system's payment methods. "Pincode" rows are
 * deliberately skipped rather than mapped to Payroll Deduction - those
 * are civil-servant payments collected through the Accountant
 * General's monthly deduction file, which already has its own import
 * pipeline (deduction-import). Including them here risked posting the
 * same real payment twice through two different upload paths.
 */
function mapPaymentMode(raw: string): string | null {
  const normalized = raw.trim().toLowerCase();
  if (normalized === 'cash') return 'Cash Office Payment';
  if (normalized === 'orange money' || normalized === 'moneymi') return 'Mobile Money';
  if (normalized === 'pincode') return null;
  return null;
}

/**
 * EMI's real "Premium Payment Hub" format: one sheet per month, header
 * row at row 3 (title + blank row above it), columns Policy No,
 * Amount, Month Paid For (a text month name, no year - the actual
 * premium month a payment covers, which is often a different, earlier
 * month than the sheet it was recorded in for late payments), and
 * Payment Mode. The year isn't present anywhere parseable in the file
 * itself, so it's supplied explicitly by whoever uploads it rather
 * than guessed.
 */
async function parsePaymentsFile(
  buffer: Buffer,
  year: number,
): Promise<{ rows: { policyNo: string; paymentMonth: string; amount: number; paymentMethod: string }[]; skippedPincode: number; skippedUnrecognizedMonth: string[] }> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as any);
  if (wb.worksheets.length === 0) throw new BadRequestException('That file has no worksheets to read.');

  const rows: { policyNo: string; paymentMonth: string; amount: number; paymentMethod: string }[] = [];
  let skippedPincode = 0;
  const skippedUnrecognizedMonth: string[] = [];

  for (const ws of wb.worksheets) {
    // Header row is at row 3 in every real sheet seen - but matched by
    // label, not assumed, in case a future export shifts it.
    let headerRowNum = 3;
    let col: Record<string, number> = {};
    for (let r = 1; r <= Math.min(ws.rowCount, 5); r++) {
      const headerRow = ws.getRow(r);
      const candidate: Record<string, number> = {};
      for (let c = 1; c <= headerRow.cellCount; c++) {
        const v = headerRow.getCell(c).value;
        if (v) candidate[String(v).trim().toLowerCase()] = c;
      }
      if (candidate['policy no'] || candidate['policy number']) {
        col = candidate;
        headerRowNum = r;
        break;
      }
    }
    const cPolicy = col['policy no'] ?? col['policy number'];
    const cAmount = col['amount'];
    const cMonth = col['month paid for'] ?? col['month'];
    const cMode = col['payment mode'] ?? col['payment mode '] ?? col['mode'];
    if (!cPolicy || !cAmount || !cMonth || !cMode) continue; // not a real data sheet - skip quietly

    for (let r = headerRowNum + 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const policyCell = row.getCell(cPolicy).value;
      if (!policyCell) continue;
      const amountCell = row.getCell(cAmount).value;
      const amount = typeof amountCell === 'number' ? amountCell : parseFloat(String(amountCell));
      const monthText = String(row.getCell(cMonth).value ?? '').trim().toLowerCase();
      const monthNum = MONTH_NAME_TO_NUM[monthText];
      if (!monthNum) {
        skippedUnrecognizedMonth.push(`row with policy ${String(policyCell).trim()}: "${monthText}"`);
        continue;
      }
      const modeCell = String(row.getCell(cMode).value ?? '').trim();
      const paymentMethod = mapPaymentMode(modeCell);
      if (!paymentMethod) {
        if (modeCell.toLowerCase() === 'pincode') skippedPincode++;
        continue;
      }
      rows.push({
        policyNo: String(policyCell).trim(),
        paymentMonth: `${year}-${String(monthNum).padStart(2, '0')}`,
        amount: isNaN(amount) ? 0 : amount,
        paymentMethod,
      });
    }
  }
  return { rows, skippedPincode, skippedUnrecognizedMonth };
}

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('bulk-upload')
  @Roles('Super Admin', 'Finance Manager')
  @AuditLog({ action: 'payment.bulk_historical_upload', entityType: 'payment' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_PAYMENT_UPLOAD_BYTES } }))
  async bulkUpload(
    @UploadedFile() file: Express.Multer.File,
    @Body('year') yearRaw: string | undefined,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    if (!file) throw new BadRequestException('No file was uploaded.');
    const year = yearRaw ? parseInt(yearRaw, 10) : new Date().getFullYear();
    if (isNaN(year) || year < 2000 || year > 2100) {
      throw new BadRequestException('year must be a valid 4-digit year.');
    }
    const { rows, skippedPincode, skippedUnrecognizedMonth } = await parsePaymentsFile(file.buffer, year);
    if (rows.length === 0 && skippedPincode === 0) {
      throw new BadRequestException('No valid rows were found - check the file has "Policy No", "Amount", "Month Paid For", and "Payment Mode" columns.');
    }
    const result = await this.paymentsService.bulkUploadPayments(rows, actor);
    return { ...result, skippedPincode, skippedUnrecognizedMonth };
  }

  @Post()
  @UseInterceptors(IdempotencyInterceptor)
  @AuditLog({ action: 'payment.posted', entityType: 'payment' })
  async post(
    @Body() dto: PostPaymentDto,
    @IdempotencyKey() idempotencyKey: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.paymentsService.postPayment(dto, idempotencyKey, user);
  }

  @Get('export')
  async exportPayments(@Query('search') search: string | undefined, @Res() res: Response) {
    const payments = await this.paymentsService.findRecent(5000, search);
    const buffer = await buildExcelExport(
      'Premium Collection',
      [
        { header: 'Receipt No', key: 'receiptNo', width: 18 },
        { header: 'Date', key: 'date', width: 14 },
        { header: 'Client', key: 'clientName', width: 24 },
        { header: 'Policy No', key: 'policyNo', width: 20 },
        { header: 'Payment Month', key: 'paymentMonth', width: 14 },
        { header: 'Amount', key: 'amount', width: 14, numeric: true },
        { header: 'Method', key: 'paymentMethod', width: 20 },
      ],
      payments.map((p) => ({
        receiptNo: p.receiptNo, date: p.createdAt.toISOString().slice(0, 10),
        clientName: p.policy?.client?.fullName ?? '', policyNo: p.policy?.policyNo ?? '',
        paymentMonth: p.paymentMonth, amount: Number(p.amount), paymentMethod: p.paymentMethod,
      })),
      'Premium Collection',
    );
    sendExcelFile(res, buffer, 'premium-collection.xlsx');
  }

  @Get('by-policy/:policyId')
  async findByPolicy(@Param('policyId') policyId: string) {
    return this.paymentsService.findByPolicy(policyId);
  }

  @Get()
  async findRecent(
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
  ) {
    return this.paymentsService.findRecent(
      limit ? parseInt(limit, 10) : undefined,
      search,
      page ? parseInt(page, 10) : undefined,
    );
  }

  @Post('bulk')
  @Roles('Super Admin', 'Finance Manager')
  @AuditLog({ action: 'payment.bulk_posted', entityType: 'payment' })
  async postBulk(
    @Body('rows') rows: { policyNo: string; paymentMonth: string; amount: number }[],
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!Array.isArray(rows) || rows.length === 0) {
      return { succeeded: 0, failed: [] };
    }
    if (rows.length > 2000) {
      return { succeeded: 0, failed: [{ row: 0, policyNo: '', error: 'Batch too large - split into files of 2000 rows or fewer' }] };
    }
    return this.paymentsService.postBulk(rows, user);
  }

  @Post(':id/reverse')
  @Roles('Super Admin', 'Finance Manager', 'Branch Manager')
  @AuditLog({ action: 'payment.reversed', entityType: 'payment' })
  async reverse(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.paymentsService.reverse(id, user);
  }
}
