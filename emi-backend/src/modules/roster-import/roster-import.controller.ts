import {
  Body, Controller, Get, Param, Post, Query, UploadedFile, UseInterceptors, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuditLog } from '../../common/decorators/audit-log.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { RosterImportService } from './roster-import.service';
import { ResolveRosterIssueDto } from './dto/resolve-roster-issue.dto';

const MAX_ROSTER_BYTES = 15 * 1024 * 1024;

@Controller('roster-import')
@Roles('Super Admin')
export class RosterImportController {
  constructor(private readonly rosterImportService: RosterImportService) {}

  @Post('upload')
  @AuditLog({ action: 'roster_import.uploaded', entityType: 'roster_import' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_ROSTER_BYTES } }))
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body('productId') productId: string,
    @Body('format') format: 'pay_smol_smol' | 'css' | 'pikin' | 'super_savings_plus' | undefined,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    if (!file) throw new BadRequestException('No file was uploaded.');
    if (!productId) throw new BadRequestException('Choose which product this roster is for.');
    return this.rosterImportService.importRoster(file.buffer, productId, file.originalname, actor, format || 'pay_smol_smol');
  }

  @Get('issues')
  async listIssues(@Query('productId') productId: string, @Query('status') status?: string) {
    if (!productId) throw new BadRequestException('productId is required.');
    return this.rosterImportService.listIssues(productId, status);
  }

  @Post('issues/:id/resolve')
  @AuditLog({ action: 'roster_import.issue_resolved', entityType: 'roster_import_issue' })
  async resolveIssue(@Param('id') id: string, @Body() dto: ResolveRosterIssueDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.rosterImportService.resolveIssue(id, dto, actor);
  }

  @Post('issues/:id/dismiss')
  @AuditLog({ action: 'roster_import.issue_dismissed', entityType: 'roster_import_issue' })
  async dismissIssue(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    await this.rosterImportService.dismissIssue(id, actor);
    return { dismissed: true };
  }
}
