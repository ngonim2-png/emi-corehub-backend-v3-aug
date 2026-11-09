import { Controller, Get, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { Roles } from '../../common/decorators/roles.decorator';
import { LeadershipReportsService } from './leadership-reports.service';
import { buildExcelExport } from '../../common/utils/excel-export.util';
import { sendExcelFile } from '../../common/utils/send-excel-file.util';

@Controller('leadership/reports')
@Roles('Super Admin')
export class LeadershipReportsController {
  constructor(private readonly reportsService: LeadershipReportsService) {}

  @Get('weekly')
  async weekly(@Query('weekStartDate') weekStartDate: string) {
    return this.reportsService.weeklyReport(weekStartDate);
  }

  @Get('weekly/export')
  async weeklyExport(@Query('weekStartDate') weekStartDate: string, @Res() res: Response) {
    const report = await this.reportsService.weeklyReport(weekStartDate);
    const rows = report.targets.flatMap((t) =>
      t.assignments.map((a) => ({
        target: t.description, assignedTo: a.assignedTo, status: a.status,
        targetValue: t.targetValue ?? '', actualValue: a.actualValue ?? '', unit: t.unit ?? '',
      })),
    );
    const buffer = await buildExcelExport(
      'Weekly Report',
      [
        { header: 'Target', key: 'target', width: 32 },
        { header: 'Assigned To (User ID)', key: 'assignedTo', width: 26 },
        { header: 'Status', key: 'status', width: 12 },
        { header: 'Target Value', key: 'targetValue', width: 14, numeric: true },
        { header: 'Actual Value', key: 'actualValue', width: 14, numeric: true },
        { header: 'Unit', key: 'unit', width: 10 },
      ],
      rows,
      `Weekly Report — week of ${weekStartDate} (completion rate ${(report.completionRate * 100).toFixed(0)}%)`,
    );
    sendExcelFile(res, buffer, `weekly-report-${weekStartDate}.xlsx`);
  }

  @Get('monthly')
  async monthly(@Query('month') month: string) {
    return this.reportsService.monthlyReport(month);
  }

  @Get('monthly/export')
  async monthlyExport(@Query('month') month: string, @Res() res: Response) {
    const report = await this.reportsService.monthlyReport(month);
    const buffer = await buildExcelExport(
      'Monthly Report',
      [
        { header: 'Goal', key: 'description', width: 40 },
        { header: 'Status', key: 'status', width: 14 },
      ],
      report.goals.map((g) => ({ description: g.description, status: g.status })),
      `Monthly Report — ${month} (target completion rate ${(report.completionRate * 100).toFixed(0)}%)`,
    );
    sendExcelFile(res, buffer, `monthly-report-${month}.xlsx`);
  }

  @Get('appraisal')
  async appraisal(@Query('userId') userId: string, @Query('month') month: string) {
    return this.reportsService.appraisalReport(userId, month);
  }

  @Get('appraisal/export')
  async appraisalExport(@Query('userId') userId: string, @Query('month') month: string, @Res() res: Response) {
    const report = await this.reportsService.appraisalReport(userId, month);
    const rows: Record<string, string | number | null>[] = [
      ...report.assignments.map((a) => ({
        type: 'Target', item: a.targetDescription, dueOrWeek: a.weekStartDate, status: a.status,
        targetValue: a.targetValue ?? null, actualValue: a.actualValue ?? null, unit: a.unit ?? '',
      })),
      ...report.actionItemsDetail.map((ai) => ({
        type: 'Action item', item: ai.title, dueOrWeek: ai.dueDate, status: ai.status,
        targetValue: null, actualValue: null, unit: '',
      })),
    ];
    const buffer = await buildExcelExport(
      'Appraisal',
      [
        { header: 'Type', key: 'type', width: 12 },
        { header: 'Item', key: 'item', width: 32 },
        { header: 'Week / Due', key: 'dueOrWeek', width: 14 },
        { header: 'Status', key: 'status', width: 12 },
        { header: 'Target Value', key: 'targetValue', width: 14, numeric: true },
        { header: 'Actual Value', key: 'actualValue', width: 14, numeric: true },
        { header: 'Unit', key: 'unit', width: 10 },
      ],
      rows,
      `Appraisal Report — ${month} (KPI: ${report.kpiPercent !== null ? (report.kpiPercent * 100).toFixed(0) + '%' : 'N/A'})`,
    );
    sendExcelFile(res, buffer, `appraisal-${userId}-${month}.xlsx`);
  }

  @Get('production')
  async production(@Query('period') period: string) {
    return this.reportsService.productionReport(period);
  }

  @Get('production/export')
  async productionExport(@Query('period') period: string, @Res() res: Response) {
    const report = await this.reportsService.productionReport(period);
    const buffer = await buildExcelExport(
      'Production Report',
      [
        { header: 'Metric', key: 'metric', width: 32 },
        { header: 'Value', key: 'value', width: 20 },
      ],
      [
        { metric: 'Policies in force', value: report.policiesInForce },
        { metric: 'New policies written', value: report.newPoliciesWritten },
        { metric: 'Premium collected (cash)', value: report.premiumCollected },
        { metric: 'Premium income (accrued)', value: report.premiumIncomeAccrued },
        { metric: 'Claims paid', value: report.claimsPaid },
        { metric: 'Claims registered', value: report.claimsRegistered },
        { metric: 'Claims reserved (outstanding)', value: report.claimsReserved },
        { metric: 'Lapse ratio', value: `${(report.lapseRatio * 100).toFixed(1)}%` },
      ],
      `Production Report — ${period} — Enhanced Mutual Insurance (SL) Ltd`,
    );
    sendExcelFile(res, buffer, `production-report-${period}.xlsx`);
  }
}
