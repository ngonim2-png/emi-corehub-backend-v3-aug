import { Body, Controller, Get, Headers, Param, Post, Query, Res, UnauthorizedException } from '@nestjs/common';
import { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuditLog } from '../../common/decorators/audit-log.decorator';
import { CrmService } from './crm.service';
import { CreateLeadDto, CreateComplaintDto, LogInteractionDto } from './dto/crm.dto';
import { buildExcelExport } from '../../common/utils/excel-export.util';
import { sendExcelFile } from '../../common/utils/send-excel-file.util';

@Controller('crm')
export class CrmController {
  constructor(
    private readonly crmService: CrmService,
    private readonly config: ConfigService,
  ) {}

  @Post('leads')
  async createLead(@Body() dto: CreateLeadDto) {
    return this.crmService.createLead(dto);
  }

  @Get('leads')
  async findLeads(
    @Query('status') status?: string,
    @Query('assignedTo') assignedTo?: string,
    @Query('stale') stale?: string,
  ) {
    return this.crmService.findLeads({ status, assignedTo, stale: stale === 'true' });
  }

  @Get('leads/export')
  async exportLeads(@Res() res: Response) {
    const leads = await this.crmService.findLeads();
    const buffer = await buildExcelExport(
      'Leads',
      [
        { header: 'Name', key: 'name', width: 22 },
        { header: 'Phone', key: 'phone', width: 16 },
        { header: 'Source', key: 'source', width: 14 },
        { header: 'District', key: 'district', width: 14 },
        { header: 'Score', key: 'score', width: 10, numeric: true },
        { header: 'Status', key: 'status', width: 14 },
        { header: 'Created', key: 'createdAt', width: 14 },
      ],
      leads.map((l) => ({
        name: l.name, phone: l.phone ?? '', source: l.source ?? '', district: l.district ?? '',
        score: l.score, status: l.status, createdAt: l.createdAt.toISOString().slice(0, 10),
      })),
      'Leads',
    );
    sendExcelFile(res, buffer, 'leads.xlsx');
  }

  @Post('leads/:id/reassign')
  @Roles('Super Admin', 'Branch Manager')
  async reassignLead(@Param('id') id: string, @Body('assignedTo') assignedTo: string) {
    return this.crmService.reassignLead(id, assignedTo);
  }

  @Post('leads/:id/status')
  async updateLeadStatus(@Param('id') id: string, @Body('status') status: string) {
    return this.crmService.updateLeadStatus(id, status as any);
  }

  @Post('leads/:id/convert')
  @AuditLog({ action: 'lead.converted', entityType: 'lead' })
  async convertLead(@Param('id') id: string, @Body('clientId') clientId: string) {
    return this.crmService.convertLead(id, clientId);
  }

  /**
   * The actual plug point for a real Meta/Facebook Lead Ads (or any
   * other external form) integration: whatever webhook the provider
   * calls lands here, gets validated against a shared secret (providers
   * don't have a user login, so this can't go through the normal JWT
   * guard), and becomes a real Lead - auto-scored and auto-assigned the
   * same as any lead entered by hand. Nothing else in the system needs
   * to change when a real integration is wired up here.
   */
  @Public()
  @Post('external-leads')
  async captureExternalLead(
    @Headers('x-webhook-secret') providedSecret: string,
    @Body() dto: CreateLeadDto,
  ) {
    const expectedSecret = this.config.get<string>('leadWebhookSecret');
    if (!expectedSecret || providedSecret !== expectedSecret) {
      throw new UnauthorizedException('Invalid or missing webhook secret');
    }
    return this.crmService.createLead(dto);
  }

  @Post('complaints')
  @AuditLog({ action: 'complaint.logged', entityType: 'complaint' })
  async createComplaint(@Body() dto: CreateComplaintDto) {
    return this.crmService.createComplaint(dto);
  }

  @Get('complaints')
  async findComplaints(@Query('status') status?: string) {
    return this.crmService.findComplaints(status);
  }

  @Post('complaints/:id/resolve')
  @Roles('Super Admin', 'Branch Manager')
  async resolveComplaint(@Param('id') id: string) {
    return this.crmService.resolveComplaint(id);
  }

  @Post('interactions')
  async logInteraction(@Body() dto: LogInteractionDto) {
    return this.crmService.logInteraction(dto);
  }

  @Get('interactions')
  async findInteractions(@Query('clientId') clientId: string) {
    return this.crmService.findInteractions(clientId);
  }
}
