import { Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuditLog } from '../../common/decorators/audit-log.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { UnderwritingService } from './underwriting.service';
import { CreateUnderwritingCaseDto } from './dto/create-underwriting-case.dto';
import { DecideUnderwritingDto } from './dto/decide-underwriting.dto';
import { buildExcelExport } from '../../common/utils/excel-export.util';
import { sendExcelFile } from '../../common/utils/send-excel-file.util';

@Controller('underwriting')
export class UnderwritingController {
  constructor(private readonly underwritingService: UnderwritingService) {}

  @Post()
  @AuditLog({ action: 'underwriting.case_created', entityType: 'underwriting_case' })
  async create(@Body() dto: CreateUnderwritingCaseDto) {
    return this.underwritingService.create(dto);
  }

  @Get('export')
  async exportCases(@Res() res: Response) {
    const cases = await this.underwritingService.findAllWithRelations();
    const buffer = await buildExcelExport(
      'Underwriting',
      [
        { header: 'Client', key: 'clientName', width: 24 },
        { header: 'Product', key: 'productName', width: 18 },
        { header: 'Sum Assured', key: 'sumAssured', width: 16, numeric: true },
        { header: 'Decision', key: 'decision', width: 16 },
        { header: 'Decision Reason', key: 'decisionReason', width: 28 },
        { header: 'Decided At', key: 'decidedAt', width: 14 },
      ],
      cases.map((c) => ({
        clientName: c.client?.fullName ?? '', productName: c.product?.name ?? '', sumAssured: Number(c.sumAssured),
        decision: c.decision, decisionReason: c.decisionReason ?? '', decidedAt: c.decidedAt ? c.decidedAt.toISOString().slice(0, 10) : '',
      })),
      'Underwriting',
    );
    sendExcelFile(res, buffer, 'underwriting.xlsx');
  }

  @Get()
  async findAll(@Query('status') status?: string) {
    return this.underwritingService.findAll(status);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.underwritingService.findOne(id);
  }

  @Post(':id/decision')
  @Roles('Super Admin', 'Underwriting Officer')
  @AuditLog({ action: 'underwriting.decided', entityType: 'underwriting_case' })
  async decide(
    @Param('id') id: string,
    @Body() dto: DecideUnderwritingDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.underwritingService.decide(id, dto, user);
  }
}
