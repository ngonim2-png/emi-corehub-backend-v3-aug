import {
  Body, Controller, Delete, Get, Param, Post, Res, UploadedFile, UseInterceptors, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuditLog } from '../../common/decorators/audit-log.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { PolicyDocumentsService } from './policy-documents.service';

const MAX_TEMPLATE_BYTES = 10 * 1024 * 1024;

@Controller('policy-documents')
export class PolicyDocumentsController {
  constructor(private readonly policyDocumentsService: PolicyDocumentsService) {}

  @Post('templates/upload')
  @Roles('Super Admin')
  @AuditLog({ action: 'policy_document_template.uploaded', entityType: 'policy_document_template' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_TEMPLATE_BYTES } }))
  async uploadTemplate(
    @UploadedFile() file: Express.Multer.File,
    @Body('name') name: string,
    @Body('productId') productId: string | undefined,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    if (!file) throw new BadRequestException('No file was uploaded.');
    return this.policyDocumentsService.uploadTemplate(file.buffer, name || file.originalname, productId, actor);
  }

  @Get('templates')
  async listTemplates() {
    return this.policyDocumentsService.listTemplates();
  }

  @Delete('templates/:id')
  @Roles('Super Admin')
  @AuditLog({ action: 'policy_document_template.deleted', entityType: 'policy_document_template' })
  async deleteTemplate(@Param('id') id: string) {
    await this.policyDocumentsService.deleteTemplate(id);
    return { deleted: true };
  }

  @Get(':policyId/generate')
  async generate(@Param('policyId') policyId: string, @Res() res: Response) {
    const { buffer, filename } = await this.policyDocumentsService.generate(policyId);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': buffer.length,
    });
    res.send(buffer);
  }
}
