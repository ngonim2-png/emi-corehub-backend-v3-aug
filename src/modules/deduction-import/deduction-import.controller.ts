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
    @Body('period') period: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    if (!file) throw new BadRequestException('No file was uploaded.');
    if (!period) throw new BadRequestException('Choose which month this deduction file is for.');
    return this.deductionImportService.importDeductions(file.buffer, period, file.originalname, actor);
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
