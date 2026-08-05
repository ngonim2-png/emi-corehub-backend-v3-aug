import { Controller, Get, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { Roles } from '../../common/decorators/roles.decorator';
import { SlicomMonthlyService } from './slicom-monthly.service';

@Controller('reports/slicom-monthly')
@Roles('Super Admin', 'Finance Manager')
export class SlicomMonthlyController {
  constructor(private readonly slicomService: SlicomMonthlyService) {}

  @Get()
  async download(@Query('period') period: string, @Res() res: Response) {
    const buffer = await this.slicomService.generate(period);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="SLICOM-Monthly-Return-${period}.xlsx"`,
      'Content-Length': buffer.length,
    });
    res.send(buffer);
  }
}
