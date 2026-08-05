import {
  Body, Controller, Get, Param, Post, Query, Res, UploadedFile, UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { AuditLog } from '../../common/decorators/audit-log.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { DocumentsService } from './documents.service';

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15MB - generous for scanned KYC docs/photos, still bounded

@Controller('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post('upload')
  @AuditLog({ action: 'document.uploaded', entityType: 'document' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body('name') name: string,
    @Body('category') category: string,
    @Body('relatedType') relatedType: string,
    @Body('relatedId') relatedId: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!file) throw new BadRequestException('No file was uploaded.');
    return this.documentsService.upload(
      file.buffer,
      file.originalname,
      file.mimetype,
      { name: name || file.originalname, category, relatedType, relatedId },
      user,
    );
  }

  @Get(':id/download')
  async download(@Param('id') id: string, @Res() res: Response) {
    const { buffer, document } = await this.documentsService.download(id);
    res.set({
      'Content-Type': document.mimeType || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${document.name.replace(/"/g, '')}"`,
      'Content-Length': buffer.length,
    });
    res.send(buffer);
  }

  @Get()
  async find(
    @Query('relatedType') relatedType?: string,
    @Query('relatedId') relatedId?: string,
    @Query('category') category?: string,
  ) {
    if (relatedType && relatedId) {
      return this.documentsService.findByRelated(relatedType, relatedId);
    }
    return this.documentsService.findAll(category);
  }
}
