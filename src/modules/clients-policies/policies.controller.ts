import { Body, Controller, Get, Param, Patch, Post, Query, Res, UploadedFile, UseInterceptors, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuditLog } from '../../common/decorators/audit-log.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { PoliciesService } from './policies.service';
import { CreatePolicyDto } from './dto/create-policy.dto';
import { EditPolicyNumberDto } from './dto/edit-policy-number.dto';
import { PaymentsService } from '../field-collection-wallet/payments.service';
import { computePolicyStatus } from './policy-status.util';
import { Money } from '../../common/utils/money.util';
import { buildExcelExport } from '../../common/utils/excel-export.util';
import { sendExcelFile } from '../../common/utils/send-excel-file.util';

const MAX_APPLICATION_FORM_BYTES = 10 * 1024 * 1024; // scanned/photographed multi-page forms can run larger than a simple profile photo

@Controller('policies')
export class PoliciesController {
  constructor(
    private readonly policiesService: PoliciesService,
    private readonly paymentsService: PaymentsService,
    private readonly config: ConfigService,
  ) {}

  @Post()
  @AuditLog({ action: 'policy.created', entityType: 'policy' })
  async create(@Body() dto: CreatePolicyDto) {
    return this.policiesService.create(dto);
  }

  /**
   * Live status/arrears computation for every policy, using the exact
   * same policy-status.util.ts the nightly lapse-detection job uses -
   * this is what lets the frontend show up-to-the-second status without
   * waiting for the batch job, the same way the original prototype did.
   *
   * Declared before the `:id` route below - Express/Nest match routes in
   * registration order, so a wildcard param route declared first would
   * otherwise swallow this literal path (treating "reports" as the id).
   */
  @Get('reports/computed')
  async computed(@Query('reportingMonth') reportingMonth?: string) {
    return this.policiesService.computedReport(reportingMonth);
  }

  @Get('reports/export')
  async exportRegister(@Query('reportingMonth') reportingMonth: string | undefined, @Res() res: Response) {
    const rows = await this.policiesService.computedReport(reportingMonth);
    const buffer = await buildExcelExport(
      'Client & Policy Register',
      [
        { header: 'Policy No', key: 'policyNo', width: 20 },
        { header: 'Client', key: 'clientName', width: 24 },
        { header: 'Phone', key: 'clientPhone', width: 16 },
        { header: 'Product', key: 'productName', width: 18 },
        { header: 'Status', key: 'status', width: 20 },
        { header: 'Monthly Premium', key: 'monthlyPremium', width: 16, numeric: true },
        { header: 'Sum Assured', key: 'sumAssured', width: 16, numeric: true },
        { header: 'Commencement', key: 'commencementMonth', width: 14 },
        { header: 'Maturity', key: 'maturityMonth', width: 14 },
        { header: 'Total Expected', key: 'totalExpected', width: 16, numeric: true },
        { header: 'Total Paid', key: 'totalPaid', width: 16, numeric: true },
        { header: 'Total Outstanding', key: 'totalOutstanding', width: 18, numeric: true },
      ],
      rows.map((r) => ({
        policyNo: r.policyNo, clientName: r.clientName, clientPhone: r.clientPhone, productName: r.productName ?? '',
        status: r.status, monthlyPremium: r.monthlyPremium, sumAssured: r.sumAssured,
        commencementMonth: r.commencementMonth, maturityMonth: r.maturityMonth ?? '',
        totalExpected: r.totalExpected, totalPaid: r.totalPaid, totalOutstanding: r.totalOutstanding,
      })),
      `Client & Policy Register — ${reportingMonth ?? new Date().toISOString().slice(0, 7)}`,
    );
    sendExcelFile(res, buffer, `client-policy-register-${reportingMonth ?? 'current'}.xlsx`);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.policiesService.findOne(id);
  }

  @Post(':id/application-form')
  @AuditLog({ action: 'policy.application_form_uploaded', entityType: 'policy' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_APPLICATION_FORM_BYTES } }))
  async uploadApplicationForm(@Param('id') id: string, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file was uploaded.');
    return this.policiesService.uploadApplicationForm(id, file.buffer, file.originalname, file.mimetype);
  }

  @Get(':id/application-form')
  async downloadApplicationForm(@Param('id') id: string, @Res() res: Response) {
    const { buffer, mimeType } = await this.policiesService.downloadApplicationForm(id);
    res.set({ 'Content-Type': mimeType, 'Cache-Control': 'private, max-age=3600' });
    res.send(buffer);
  }

  @Post(':id/edit')
  @Roles('Supreme Admin')
  @AuditLog({ action: 'policy.edited', entityType: 'policy' })
  async edit(@Param('id') id: string, @Body() fields: Record<string, unknown>) {
    return this.policiesService.editFields(id, fields);
  }

  @Get()
  async findByClient(@Query('clientId') clientId: string) {
    return this.policiesService.findByClient(clientId);
  }

  @Patch(':id/policy-number')
  @Roles('Super Admin')
  async editPolicyNumber(
    @Param('id') id: string,
    @Body() dto: EditPolicyNumberDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.policiesService.editPolicyNumber(id, dto.policyNo, user);
  }

  @Post(':id/reinstate')
  @Roles('Super Admin', 'Underwriting Officer', 'Branch Manager')
  async reinstate(
    @Param('id') id: string,
    @Body('notes') notes: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const rules = {
      premiumDueDay: this.config.get<number>('businessRules.premiumDueDay') ?? 5,
      warningThresholdMonths: this.config.get<number>('businessRules.warningThresholdMonths') ?? 2,
      lapseThresholdMonths: this.config.get<number>('businessRules.lapseThresholdMonths') ?? 3,
    };
    const reportingMonth = new Date().toISOString().slice(0, 7);
    const paymentsByMonthMajor = await this.paymentsService.getPaymentsByMonthForPolicy(id);
    const paymentsByMonth: Record<string, number> = {};
    for (const [m, major] of Object.entries(paymentsByMonthMajor)) {
      paymentsByMonth[m] = Money.fromMajor(major).toMinor();
    }
    return this.policiesService.reinstate(id, notes, user, rules, paymentsByMonth, reportingMonth);
  }

  /**
   * Policies with a maturity date within `withinDays` (default 60) of
   * today, or already past it - the renewal queue. Only meaningful for
   * fixed-term products; policies with no maturityDate never appear here.
   */
  @Get('reports/renewals')
  async renewals(@Query('withinDays') withinDays?: string) {
    const days = withinDays ? parseInt(withinDays, 10) : 60;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + days);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    const policies = await this.policiesService.findAllWithClientAndProduct();
    return policies
      .filter((p) => p.maturityDate && p.maturityDate <= cutoffStr)
      .map((p) => ({
        policyId: p.id,
        policyNo: p.policyNo,
        clientId: p.client.id,
        clientName: p.client.fullName,
        clientPhone: p.client.phone,
        productName: p.product?.name,
        maturityDate: p.maturityDate,
        daysUntilMaturity: Math.ceil(
          (new Date(p.maturityDate as string).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
        ),
      }))
      .sort((a, b) => a.daysUntilMaturity - b.daysUntilMaturity);
  }

  @Post(':id/renew')
  @Roles('Super Admin', 'Underwriting Officer', 'Branch Manager')
  async renew(
    @Param('id') id: string,
    @Body('newMaturityDate') newMaturityDate: string,
    @Body('notes') notes: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.policiesService.renew(id, newMaturityDate, notes, user);
  }
}
