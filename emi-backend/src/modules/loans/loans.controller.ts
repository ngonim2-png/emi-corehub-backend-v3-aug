import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { LoansService } from './loans.service';
import { CreateLoanDto, LoanApprovalDecisionDto, RecordLoanRepaymentDto } from './dto/loans.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuditLog } from '../../common/decorators/audit-log.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';

@Controller('loans')
export class LoansController {
  constructor(private readonly loansService: LoansService) {}

  @Get('eligibility/:clientId')
  async eligibility(@Param('clientId') clientId: string) {
    return this.loansService.checkEligibility(clientId);
  }

  @Get()
  async findAll(@Query('status') status?: string) {
    return this.loansService.findAll(status);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.loansService.findOne(id);
  }

  @Get(':id/repayments')
  async repayments(@Param('id') id: string) {
    return this.loansService.findRepayments(id);
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
  async financeDirectorDecide(@Param('id') id: string, @Body() dto: LoanApprovalDecisionDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.loansService.financeDirectorDecide(id, dto.decision, dto.notes, actor);
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
