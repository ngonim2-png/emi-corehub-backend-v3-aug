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

/**
 * Standard template for backfilling office payments: Policy Number,
 * Payment Month, Amount, Payment Method - one row per payment, matched
 * by header label like every other bulk import in this system.
 */
async function parsePaymentsFile(
  buffer: Buffer,
): Promise<{ policyNo: string; paymentMonth: string; amount: number; paymentMethod: string }[]> {
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
  const cPolicy = col['policy number'] ?? col['policy no'] ?? col['policy no.'];
  const cMonth = col['payment month'] ?? col['month'];
  const cAmount = col['amount'];
  const cMethod = col['payment method'] ?? col['method'];
  if (!cPolicy || !cMonth || !cAmount || !cMethod) {
    throw new BadRequestException(
      'Expected columns "Policy Number", "Payment Month" (YYYY-MM), "Amount", and "Payment Method" were not found.',
    );
  }
  const rows: { policyNo: string; paymentMonth: string; amount: number; paymentMethod: string }[] = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const policyCell = row.getCell(cPolicy).value;
    if (!policyCell) continue;
    const monthCell = row.getCell(cMonth).value;
    const paymentMonth = monthCell instanceof Date
      ? `${monthCell.getUTCFullYear()}-${String(monthCell.getUTCMonth() + 1).padStart(2, '0')}`
      : String(monthCell ?? '').trim();
    const amountCell = row.getCell(cAmount).value;
    const amount = typeof amountCell === 'number' ? amountCell : parseFloat(String(amountCell));
    rows.push({
      policyNo: String(policyCell).trim(),
      paymentMonth,
      amount: isNaN(amount) ? 0 : amount,
      paymentMethod: String(row.getCell(cMethod).value ?? '').trim(),
    });
  }
  return rows;
}

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('bulk-upload')
  @Roles('Super Admin', 'Finance Manager')
  @AuditLog({ action: 'payment.bulk_historical_upload', entityType: 'payment' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_PAYMENT_UPLOAD_BYTES } }))
  async bulkUpload(@UploadedFile() file: Express.Multer.File, @CurrentUser() actor: AuthenticatedUser) {
    if (!file) throw new BadRequestException('No file was uploaded.');
    const rows = await parsePaymentsFile(file.buffer);
    if (rows.length === 0) {
      throw new BadRequestException('No valid rows were found - check the file has Policy Number, Payment Month, Amount, and Payment Method columns.');
    }
    return this.paymentsService.bulkUploadPayments(rows, actor);
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
