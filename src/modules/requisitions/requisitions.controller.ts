import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { buildExcelExport } from '../../common/utils/excel-export.util';
import { sendExcelFile } from '../../common/utils/send-excel-file.util';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuditLog } from '../../common/decorators/audit-log.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { RequisitionsService } from './requisitions.service';
import {
  CancelRequisitionDto, CreateRequisitionDto, ReceiveRequisitionDto, DepartmentDto, PayRequisitionDto, PriceRequisitionDto, RequisitionDecisionDto,
} from './dto/requisitions.dto';

/** Office requisitions. Anyone signed in can raise one; each step of the chain is checked in the service. */
@Controller('requisitions')
export class RequisitionsController {
  constructor(private readonly service: RequisitionsService) {}

  @Get('settings')
  settings() {
    return this.service.settings();
  }

  @Get('me')
  me(@CurrentUser() actor: AuthenticatedUser) {
    return this.service.me(actor);
  }

  @Get('summary')
  summary(@CurrentUser() actor: AuthenticatedUser) {
    return this.service.summary(actor);
  }

  /** Spending by department, month and account; what is signed but unpaid; what is still in the chain. */
  @Get('report')
  @Roles('Super Admin', 'Procurement Manager', 'Finance Manager', 'Finance Director', 'Managing Director', 'CEO', 'Internal Auditor')
  report(@Query('from') from?: string, @Query('to') to?: string) {
    const [f, t] = this.range(from, to);
    return this.service.report(f, t);
  }

  @Get('report/export')
  @Roles('Super Admin', 'Procurement Manager', 'Finance Manager', 'Finance Director', 'Managing Director', 'CEO', 'Internal Auditor')
  async reportExport(@Query('from') from: string | undefined, @Query('to') to: string | undefined, @Res() res: Response) {
    const [f, t] = this.range(from, to);
    const rep = await this.service.report(f, t);
    const buf = await buildExcelExport(
      'Requisitions',
      [
        { header: 'Ref', key: 'ref', width: 14 }, { header: 'Raised', key: 'raised', width: 11 }, { header: 'Department', key: 'department', width: 18 },
        { header: 'Raised by', key: 'raisedBy', width: 20 }, { header: 'Purpose', key: 'purpose', width: 40 }, { header: 'Urgency', key: 'urgency', width: 9 },
        { header: 'Supplier', key: 'supplier', width: 22 }, { header: 'Total', key: 'total', numeric: true }, { header: 'Status', key: 'status', width: 24 },
        { header: 'Paid on', key: 'paidOn', width: 11 }, { header: 'Amount paid', key: 'amountPaid', numeric: true }, { header: 'Paid from', key: 'paymentMethod', width: 12 },
        { header: 'Reference', key: 'reference', width: 14 }, { header: 'Charged to', key: 'account', width: 26 },
      ],
      rep.rows as any,
      `Office requisitions ${f} to ${t}`,
    );
    sendExcelFile(res, buf, `requisitions-${f}-to-${t}.xlsx`);
  }

  private range(from?: string, to?: string): [string, string] {
    const today = new Date().toISOString().slice(0, 10);
    const f = from || `${today.slice(0, 4)}-01-01`;
    const t = to || today;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f) || !/^\d{4}-\d{2}-\d{2}$/.test(t) || f > t) throw new BadRequestException('Choose a valid date range.');
    return [f, t];
  }

  @Get('departments')
  departments() {
    return this.service.departments();
  }

  @Get('departments/staff')
  @Roles('Super Admin', 'HR Manager')
  staff() {
    return this.service.staff();
  }

  @Post('departments')
  @Roles('Super Admin', 'HR Manager')
  @AuditLog({ action: 'department.created', entityType: 'department' })
  createDepartment(@Body() dto: DepartmentDto) {
    return this.service.saveDepartment(dto);
  }

  @Patch('departments/:id')
  @Roles('Super Admin', 'HR Manager')
  @AuditLog({ action: 'department.updated', entityType: 'department' })
  updateDepartment(@Param('id') id: string, @Body() dto: DepartmentDto) {
    return this.service.saveDepartment(dto, id);
  }

  @Delete('departments/:id')
  @Roles('Super Admin', 'HR Manager')
  @AuditLog({ action: 'department.deleted', entityType: 'department' })
  deleteDepartment(@Param('id') id: string) {
    return this.service.deleteDepartment(id);
  }

  @Get()
  list(@CurrentUser() actor: AuthenticatedUser, @Query('scope') scope?: 'mine' | 'waiting' | 'all', @Query('status') status?: string) {
    return this.service.list(actor, scope ?? 'all', status || undefined);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.findOne(id, actor);
  }

  @Post()
  @AuditLog({ action: 'requisition.raised', entityType: 'requisition' })
  create(@Body() dto: CreateRequisitionDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.create(dto, actor);
  }

  @Post(':id/resubmit')
  @AuditLog({ action: 'requisition.resubmitted', entityType: 'requisition' })
  resubmit(@Param('id') id: string, @Body() dto: CreateRequisitionDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.resubmit(id, dto, actor);
  }

  @Post(':id/cancel')
  @AuditLog({ action: 'requisition.cancelled', entityType: 'requisition' })
  cancel(@Param('id') id: string, @Body() dto: CancelRequisitionDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.cancel(id, dto.comment, actor);
  }

  @Post(':id/pricing')
  @AuditLog({ action: 'requisition.priced', entityType: 'requisition' })
  price(@Param('id') id: string, @Body() dto: PriceRequisitionDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.price(id, dto, actor);
  }

  @Post(':id/decision')
  @AuditLog({ action: 'requisition.decision', entityType: 'requisition' })
  decide(@Param('id') id: string, @Body() dto: RequisitionDecisionDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.decide(id, dto, actor);
  }

  @Post(':id/received')
  @AuditLog({ action: 'requisition.received', entityType: 'requisition' })
  received(@Param('id') id: string, @Body() dto: ReceiveRequisitionDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.receive(id, dto.note, actor);
  }

  @Post(':id/pay')
  @Roles('Finance Manager', 'Finance Director', 'Super Admin')
  @AuditLog({ action: 'requisition.paid', entityType: 'requisition' })
  pay(@Param('id') id: string, @Body() dto: PayRequisitionDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.pay(id, dto, actor);
  }
}
