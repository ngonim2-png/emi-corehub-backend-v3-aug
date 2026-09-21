import { Body, Controller, Get, Post, Query, UploadedFile, UseInterceptors, BadRequestException } from '@nestjs/common';
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
}
