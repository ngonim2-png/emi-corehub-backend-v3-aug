import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { buildExcelExport } from '../../common/utils/excel-export.util';
import { sendExcelFile } from '../../common/utils/send-excel-file.util';
import { LoansService } from './loans.service';
import {
  CreateLoanDto, LOAN_REPAYMENT_METHODS, LoanApprovalDecisionDto, LoanAssessmentDto, LoanFinalDecisionDto, RecordLoanRepaymentDto, UpdateLoanApplicationDto,
} from './dto/loans.dto';
import {
  CREDIT_ASSESSMENTS, DECISION_OUTCOMES, ID_TYPES, LOAN_CHECKLIST, LOAN_PURPOSES, PAYMENT_PERFORMANCE, PREMIUM_PAYMENT_METHODS,
} from './entities/loan.entity';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuditLog } from '../../common/decorators/audit-log.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';

@Controller('loans')
export class LoansController {
  constructor(private readonly loansService: LoansService) {}

  /** Rate and tenures in force, for the request forms. */
  @Get('settings')
  settings() {
    return {
      interestRatePct: this.loansService.interestRatePct,
      tenureOptions: this.loansService.tenureOptions,
      minMonthsPaid: this.loansService.minMonthsPaid,
      purposes: LOAN_PURPOSES,
      repaymentMethods: LOAN_REPAYMENT_METHODS,
      idTypes: ID_TYPES,
      premiumPaymentMethods: PREMIUM_PAYMENT_METHODS,
      paymentPerformance: PAYMENT_PERFORMANCE,
      creditAssessments: CREDIT_ASSESSMENTS,
      decisionOutcomes: DECISION_OUTCOMES,
      checklist: LOAN_CHECKLIST,
      maxDtiPct: this.loansService.maxDtiPct,
      requireChecklist: this.loansService.requireChecklist,
    };
  }

  /** Loan book: balances, arrears and totals. */
  @Get('book')
  @Roles('Super Admin', 'Supreme Admin', 'Finance Manager', 'Finance Director', 'Life Manager', 'Internal Auditor', 'Branch Manager')
  async book() {
    return this.loansService.book();
  }

  @Get('book/export')
  @Roles('Super Admin', 'Supreme Admin', 'Finance Manager', 'Finance Director', 'Life Manager', 'Internal Auditor', 'Branch Manager')
  async bookExport(@Query('only') only: string | undefined, @Res() res: Response) {
    const b = await this.loansService.book();
    const rows = only === 'arrears' ? b.arrears : b.loans;
    const buf = await buildExcelExport(
      only === 'arrears' ? 'Loans in arrears' : 'Loan book',
      [
        { header: 'Loan ref', key: 'loanRef', width: 14 },
        { header: 'Client', key: 'clientName', width: 26 },
        { header: 'Phone', key: 'clientPhone', width: 14 },
        { header: 'Type', key: 'loanType', width: 10 },
        { header: 'Purpose', key: 'purpose', width: 24 },
        { header: 'Status', key: 'status', width: 24 },
        { header: 'Paid out', key: 'disbursed', width: 12 },
        { header: 'Amount', key: 'principal', numeric: true },
        { header: 'Interest', key: 'totalInterest', numeric: true },
        { header: 'Total to repay', key: 'totalRepayable', numeric: true },
        { header: 'Monthly', key: 'monthlyPayment', numeric: true },
        { header: 'Months', key: 'tenureMonths' },
        { header: 'Repaid', key: 'paid', numeric: true },
        { header: 'Balance', key: 'balance', numeric: true },
        { header: 'Overdue', key: 'overdueAmount', numeric: true },
        { header: 'Installments overdue', key: 'installmentsOverdue' },
        { header: 'Overdue since', key: 'oldestOverdueMonth', width: 12 },
        { header: 'Interest earned', key: 'interestEarned', numeric: true },
      ],
      rows.map((r) => ({ ...r, disbursed: r.disbursedAt ? new Date(r.disbursedAt).toISOString().slice(0, 10) : '', requestedAt: null } as any)),
      `${only === 'arrears' ? 'Loans in arrears' : 'Loan book'} as of ${b.asOfMonth}`,
    );
    sendExcelFile(res, buf, `${only === 'arrears' ? 'loans-in-arrears' : 'loan-book'}-${b.asOfMonth}.xlsx`);
  }

  /** Writes reminder SMS for loans in arrears into the Pending SMS queue for staff to review and send. */
  @Post('reminders')
  @Roles('Super Admin', 'Finance Manager', 'Finance Director', 'Life Manager', 'Branch Manager')
  @AuditLog({ action: 'loan.arrears_reminders_queued', entityType: 'loan' })
  async reminders(@Body('loanIds') loanIds?: string[]) {
    return this.loansService.queueArrearsReminders(Array.isArray(loanIds) ? loanIds.filter((x) => typeof x === 'string') : undefined);
  }

  @Get('documents/:fileId')
  async document(@Param('fileId') fileId: string, @Res() res: Response) {
    const f = await this.loansService.getDocument(fileId);
    res.set({ 'Content-Type': f.mimeType, 'Content-Disposition': `inline; filename="${f.filename.replace(/[^\w.\- ]/g, '_')}"`, 'Cache-Control': 'private, max-age=300' });
    res.send(f.data);
  }

  @Get('eligibility/:clientId')
  async eligibility(@Param('clientId') clientId: string) {
    return this.loansService.checkEligibility(clientId);
  }

  @Get()
  async findAll(@Query('status') status?: string, @Query('clientId') clientId?: string) {
    return this.loansService.findAll(status, clientId);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.loansService.findOne(id);
  }

  @Get(':id/repayments')
  async repayments(@Param('id') id: string) {
    return this.loansService.findRepayments(id);
  }

  @Get(':id/verification')
  async verification(@Param('id') id: string) {
    return this.loansService.verification(id);
  }

  @Get(':id/documents')
  async documents(@Param('id') id: string) {
    return this.loansService.listDocuments(id);
  }

  @Post(':id/documents')
  @AuditLog({ action: 'loan.document_added', entityType: 'loan' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 6 * 1024 * 1024 } }))
  async addDocument(@Param('id') id: string, @UploadedFile() file: Express.Multer.File, @Body('kind') kind: string) {
    if (!file) throw new BadRequestException('No file was uploaded.');
    await this.loansService.addDocuments(id, [{ kind: kind || 'other', file }]);
    return this.loansService.listDocuments(id);
  }

  @Patch(':id/application')
  @AuditLog({ action: 'loan.application_updated', entityType: 'loan' })
  async updateApplication(@Param('id') id: string, @Body() dto: UpdateLoanApplicationDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.loansService.updateApplication(id, dto, actor);
  }

  @Post(':id/assessment')
  @Roles('Life Manager', 'Supreme Admin')
  @AuditLog({ action: 'loan.assessed', entityType: 'loan' })
  async assess(@Param('id') id: string, @Body() dto: LoanAssessmentDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.loansService.assess(id, dto, actor);
  }

  @Post(':id/reopen')
  @Roles('Life Manager', 'Finance Director', 'Supreme Admin')
  @AuditLog({ action: 'loan.reopened', entityType: 'loan' })
  async reopen(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.loansService.reopen(id, actor);
  }

  @Post()
  @AuditLog({ action: 'loan.requested', entityType: 'loan' })
  async create(@Body() dto: CreateLoanDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.loansService.create(dto, actor);
  }

  @Post(':id/life-manager-decision')
  @Roles('Life Manager', 'Supreme Admin')
  @AuditLog({ action: 'loan.life_manager_decision', entityType: 'loan' })
  async lifeManagerDecide(@Param('id') id: string, @Body() dto: LoanApprovalDecisionDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.loansService.lifeManagerDecide(id, dto.decision, dto.notes, actor);
  }

  @Post(':id/finance-director-decision')
  @Roles('Finance Director', 'Supreme Admin')
  @AuditLog({ action: 'loan.finance_director_decision', entityType: 'loan' })
  async financeDirectorDecide(@Param('id') id: string, @Body() dto: LoanFinalDecisionDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.loansService.financeDirectorDecide(id, dto, actor);
  }

  @Post(':id/disburse')
  @Roles('Finance Director', 'Finance Manager', 'Super Admin', 'Supreme Admin')
  @AuditLog({ action: 'loan.disbursed', entityType: 'loan' })
  async disburse(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.loansService.disburse(id, actor);
  }

  @Post('repayments/:repaymentId')
  @Roles('Finance Manager', 'Branch Manager', 'Super Admin', 'Supreme Admin')
  @AuditLog({ action: 'loan.repayment_recorded', entityType: 'loan_repayment' })
  async recordRepayment(@Param('repaymentId') repaymentId: string, @Body() dto: RecordLoanRepaymentDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.loansService.recordRepayment(repaymentId, dto, actor);
  }
}
