import { Body, Controller, Get, Param, Post, Query, Res, UseInterceptors } from '@nestjs/common';
import { Response } from 'express';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuditLog } from '../../common/decorators/audit-log.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { IdempotencyKey } from '../../common/decorators/idempotency-key.decorator';
import { IdempotencyInterceptor } from '../../common/interceptors/idempotency.interceptor';
import { PaymentsService } from './payments.service';
import { PostPaymentDto } from './dto/post-payment.dto';
import { buildExcelExport } from '../../common/utils/excel-export.util';
import { sendExcelFile } from '../../common/utils/send-excel-file.util';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

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
