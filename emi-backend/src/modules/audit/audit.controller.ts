import { Controller, Get, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuditService } from './audit.service';

@Controller('audit-logs')
@Roles('Super Admin', 'Internal Auditor')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  async list(
    @Query('limit') limit?: string,
    @Query('action') action?: string,
    @Query('entityType') entityType?: string,
    @Query('userId') userId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.auditService.findRecent({
      limit: limit ? parseInt(limit, 10) : undefined,
      action,
      entityType,
      userId,
      from,
      to,
    });
  }

  @Get('export')
  async export(
    @Query('action') action: string | undefined,
    @Query('entityType') entityType: string | undefined,
    @Query('userId') userId: string | undefined,
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Res() res: Response,
  ) {
    const csv = await this.auditService.exportCsv({ action, entityType, userId, from, to });
    res.set({
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="audit-trail-${new Date().toISOString().slice(0, 10)}.csv"`,
    });
    res.send(csv);
  }
}
