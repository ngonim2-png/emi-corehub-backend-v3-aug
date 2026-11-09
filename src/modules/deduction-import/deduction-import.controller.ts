import { Body, Controller, Get, Post, Query, Res, UploadedFile, UseInterceptors, BadRequestException } from '@nestjs/common';
import { Response } from 'express';
import { buildExcelExport } from '../../common/utils/excel-export.util';
import { sendExcelFile } from '../../common/utils/send-excel-file.util';
import { FileInterceptor } from '@nestjs/platform-express';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuditLog } from '../../common/decorators/audit-log.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { DeductionImportService } from './deduction-import.service';
import { DeductionRecordStatus } from './entities/deduction-import-record.entity';

const MAX_DEDUCTION_BYTES = 15 * 1024 * 1024;

@Controller('deduction-import')
@Roles('Super Admin', 'Finance Manager')
export class DeductionImportController {
  constructor(private readonly deductionImportService: DeductionImportService) {}

  @Post('upload')
  @AuditLog({ action: 'deduction_import.uploaded', entityType: 'deduction_import' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_DEDUCTION_BYTES } }))
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body('period') period: string | undefined,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    if (!file) throw new BadRequestException('No file was uploaded.');
    return this.deductionImportService.importDeductions(file.buffer, period || undefined, file.originalname, actor);
  }

  /**
   * The raw endowment deduction database exactly as received from the
   * Accountant General's office - no period needed here, since the real
   * file already covers multiple months as separate sheets and each
   * month's period is derived from its own sheet name.
   */
  @Post('upload-emi-endowment')
  @AuditLog({ action: 'deduction_import.emi_endowment_uploaded', entityType: 'deduction_import' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_DEDUCTION_BYTES } }))
  async uploadEmiEndowment(@UploadedFile() file: Express.Multer.File, @CurrentUser() actor: AuthenticatedUser) {
    if (!file) throw new BadRequestException('No file was uploaded.');
    return this.deductionImportService.importEmiEndowmentFile(file.buffer, file.originalname, actor);
  }

  @Get('records')
  async listRecords(
    @Query('period') period?: string,
    @Query('status') status?: DeductionRecordStatus,
    @Query('mdaName') mdaName?: string,
    @Query('search') search?: string,
  ) {
    return this.deductionImportService.listRecords({ period, status, mdaName, search });
  }

  /** For the dashboard's AG table: each month's latest uploaded file total next to what was recorded. ?periods=2026-10,2026-09 */
  @Get('file-summary')
  @Roles('Super Admin', 'Finance Manager', 'Finance Director', 'Internal Auditor')
  async fileSummary(@Query('periods') periods?: string) {
    const list = String(periods || '').split(',').map((p) => p.trim()).filter((p) => /^\d{4}-\d{2}$/.test(p)).slice(0, 24);
    return this.deductionImportService.fileSummaryForPeriods(list);
  }

  /** AG lines from the latest upload for a month that could not be recorded (no policy with that pincode, or a cancelled policy). */
  @Get('not-recorded')
  @Roles('Super Admin', 'Finance Manager', 'Finance Director', 'Internal Auditor')
  async notRecorded(@Query('period') period: string) {
    if (!/^\d{4}-\d{2}$/.test(period || '')) throw new BadRequestException('period must be YYYY-MM');
    return this.deductionImportService.notRecordedLines(period);
  }

  @Get('not-recorded/export')
  @Roles('Super Admin', 'Finance Manager', 'Finance Director', 'Internal Auditor')
  async notRecordedExport(@Query('period') period: string, @Res() res: Response) {
    if (!/^\d{4}-\d{2}$/.test(period || '')) throw new BadRequestException('period must be YYYY-MM');
    const rows = await this.deductionImportService.notRecordedLines(period);
    const buffer = await buildExcelExport(
      'Not recorded',
      [
        { header: 'Name (as in AG file)', key: 'employeeName', width: 30 },
        { header: 'AG Pincode', key: 'pincode', width: 14 },
        { header: 'Ministry / MDA', key: 'mdaName', width: 40 },
        { header: 'Amount', key: 'amount', width: 14, numeric: true },
        { header: 'Reason', key: 'reason', width: 28 },
      ],
      rows,
      `AG deductions not recorded, ${period} (${rows.length})`,
    );
    sendExcelFile(res, buffer, `ag-not-recorded-${period}.xlsx`);
  }

  /** Recorded AG lines that need a look: reversed payments, amounts that differ, and policies outside their cover dates. */
  @Get('reconcile')
  @Roles('Super Admin', 'Finance Manager', 'Finance Director', 'Internal Auditor')
  async reconcile(@Query('period') period: string) {
    if (!/^\d{4}-\d{2}$/.test(period || '')) throw new BadRequestException('period must be YYYY-MM');
    return this.deductionImportService.reconcile(period);
  }
}
