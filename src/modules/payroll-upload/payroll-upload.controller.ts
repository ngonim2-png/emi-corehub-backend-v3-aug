import {
  Body, Controller, Post, UploadedFile, UseInterceptors, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuditLog } from '../../common/decorators/audit-log.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { PayrollUploadService } from './payroll-upload.service';

const MAX_PAYROLL_BYTES = 10 * 1024 * 1024; // 10MB - generous for a spreadsheet of thousands of employees

@Controller('payroll-upload')
@Roles('Super Admin', 'Finance Manager', 'HR Manager')
export class PayrollUploadController {
  constructor(private readonly payrollUploadService: PayrollUploadService) {}

  @Post()
  @AuditLog({ action: 'payroll.uploaded', entityType: 'payroll_batch' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_PAYROLL_BYTES } }))
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body('employerOrGroup') employerOrGroup: string,
    @Body('period') period: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    if (!file) throw new BadRequestException('No file was uploaded.');
    if (!employerOrGroup) throw new BadRequestException('employerOrGroup is required.');
    if (!period) throw new BadRequestException('period is required.');
    return this.payrollUploadService.processFile(file.buffer, employerOrGroup, period, actor);
  }
}
