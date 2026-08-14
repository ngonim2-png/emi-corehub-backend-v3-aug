import { Body, Controller, Get, Param, Post, Query, Res, UploadedFile, UseInterceptors, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuditLog } from '../../common/decorators/audit-log.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { PayrollService } from './payroll.service';
import { buildExcelExport } from '../../common/utils/excel-export.util';
import { sendExcelFile } from '../../common/utils/send-excel-file.util';

const MAX_PAYROLL_BYTES = 10 * 1024 * 1024;

/**
 * Restricted to HR Manager and Finance Manager - Supreme Admin can
 * always reach this too (RolesGuard bypasses every @Roles check for
 * that one role), but no other role, including Super Admin, sees
 * payroll figures.
 */
@Controller('hr/payroll')
@Roles('HR Manager', 'Finance Manager')
export class PayrollController {
  constructor(private readonly payrollService: PayrollService) {}

  @Post('upload')
  @AuditLog({ action: 'payroll.uploaded', entityType: 'payroll_run' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_PAYROLL_BYTES } }))
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body('month') month: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    if (!file) throw new BadRequestException('No file was uploaded.');
    if (!month) throw new BadRequestException('Choose which month this payroll is for.');
    return this.payrollService.uploadPayroll(file.buffer, month, file.originalname, actor);
  }

  @Get('runs')
  async listRuns() {
    return this.payrollService.listRuns();
  }

  @Get('runs/:month')
  async getRun(@Param('month') month: string) {
    const result = await this.payrollService.getRun(month);
    if (!result) return { run: null, lines: [] };
    return result;
  }

  @Get('runs/:month/export')
  async exportRun(@Param('month') month: string, @Res() res: Response) {
    const result = await this.payrollService.getRun(month);
    if (!result) throw new BadRequestException('No payroll exists for that month yet.');
    const buffer = await buildExcelExport(
      `Payroll — ${month}`,
      [
        { header: 'Employee', key: 'employeeName', width: 26 },
        { header: 'Department', key: 'department', width: 16 },
        { header: 'Days worked', key: 'daysWorked', width: 12, numeric: true },
        { header: 'Rate/day', key: 'ratePerDay', width: 12, numeric: true },
        { header: 'Basic salary', key: 'basicSalary', width: 14, numeric: true },
        { header: 'Transport', key: 'transportation', width: 12, numeric: true },
        { header: 'Rent', key: 'rentAllowance', width: 12, numeric: true },
        { header: 'Medical', key: 'medicalAllowance', width: 12, numeric: true },
        { header: 'Mobile', key: 'mobileAllowance', width: 12, numeric: true },
        { header: 'NASSIT (employee)', key: 'nassitEmployee', width: 16, numeric: true },
        { header: 'PAYE', key: 'paye', width: 12, numeric: true },
        { header: 'Total cost to company', key: 'totalCostToCompany', width: 18, numeric: true },
        { header: 'Pay Smol Smol premium', key: 'paySmolSmolPremium', width: 18, numeric: true },
        { header: 'Endowment credit', key: 'endowmentCredit', width: 16, numeric: true },
        { header: 'Rice credit', key: 'riceCredit', width: 14, numeric: true },
        { header: 'Penalty', key: 'penalty', width: 12, numeric: true },
        { header: 'Debt/advances', key: 'debtSalaryAdvances', width: 14, numeric: true },
        { header: 'Unexcused absence days', key: 'absenceDaysCount', width: 18, numeric: true },
        { header: 'Absence deduction', key: 'absenceDeduction', width: 16, numeric: true },
        { header: 'Net pay', key: 'netPay', width: 14, numeric: true },
      ],
      result.lines.map((l) => ({
        employeeName: l.employee?.fullName ?? '', department: l.employee?.department ?? '',
        daysWorked: Number(l.daysWorked), ratePerDay: Number(l.ratePerDay), basicSalary: Number(l.basicSalary),
        transportation: Number(l.transportation), rentAllowance: Number(l.rentAllowance), medicalAllowance: Number(l.medicalAllowance),
        mobileAllowance: Number(l.mobileAllowance), nassitEmployee: Number(l.nassitEmployee), paye: Number(l.paye),
        totalCostToCompany: Number(l.totalCostToCompany), paySmolSmolPremium: Number(l.paySmolSmolPremium),
        endowmentCredit: Number(l.endowmentCredit), riceCredit: Number(l.riceCredit), penalty: Number(l.penalty),
        debtSalaryAdvances: Number(l.debtSalaryAdvances), absenceDaysCount: l.absenceDaysCount,
        absenceDeduction: Number(l.absenceDeduction), netPay: l.netPay,
      })),
      `Payroll — ${month} (${result.run.status})`,
    );
    sendExcelFile(res, buffer, `payroll-${month}.xlsx`);
  }

  @Post('lines/:id/edit')
  @AuditLog({ action: 'payroll.line_edited', entityType: 'payroll_line' })
  async updateLine(@Param('id') id: string, @Body() updates: Record<string, number | string>) {
    return this.payrollService.updateLine(id, updates);
  }

  @Post('runs/:id/finalize')
  @AuditLog({ action: 'payroll.finalized', entityType: 'payroll_run' })
  async finalize(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.payrollService.finalize(id, actor);
  }
}
