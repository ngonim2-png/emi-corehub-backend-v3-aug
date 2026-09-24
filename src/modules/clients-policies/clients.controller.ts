import {
  Body, Controller, Get, Param, Post, Query, Res, UploadedFile, UseInterceptors, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuditLog } from '../../common/decorators/audit-log.decorator';
import { ClientsService } from './clients.service';
import { CreateClientDto } from './dto/create-client.dto';

const MAX_PHOTO_BYTES = 5 * 1024 * 1024; // 5MB is generous for a profile photo

@Controller('clients')
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Post()
  @AuditLog({ action: 'client.registered', entityType: 'client' })
  async create(@Body() dto: CreateClientDto) {
    return this.clientsService.create(dto);
  }

  @Get()
  async findAll(
    @Query('search') search?: string,
    @Query('district') district?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.clientsService.findAll({
      search,
      district,
      status,
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    });
  }

  @Get('referrals/leaderboard')
  async referralLeaderboard() {
    return this.clientsService.referralLeaderboard();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.clientsService.findOne(id);
  }

  @Post(':id/edit')
  @Roles('Supreme Admin', 'Super Admin', 'Underwriting Officer')
  @AuditLog({ action: 'client.edited', entityType: 'client' })
  async edit(@Param('id') id: string, @Body() fields: Record<string, unknown>) {
    return this.clientsService.editFields(id, fields);
  }

  @Post(':id/photo')
  @AuditLog({ action: 'client.photo_uploaded', entityType: 'client' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_PHOTO_BYTES } }))
  async uploadPhoto(@Param('id') id: string, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file was uploaded.');
    return this.clientsService.uploadPhoto(id, file.buffer, file.originalname, file.mimetype);
  }

  @Get(':id/photo')
  async downloadPhoto(@Param('id') id: string, @Res() res: Response) {
    const { buffer, mimeType } = await this.clientsService.downloadPhoto(id);
    res.set({ 'Content-Type': mimeType, 'Cache-Control': 'private, max-age=3600' });
    res.send(buffer);
  }
}
