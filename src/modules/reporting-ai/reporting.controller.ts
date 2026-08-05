import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { ReportingService } from './reporting.service';
import { AskAiDto } from './dto/ask-ai.dto';

@Controller('reports')
export class DashboardController {
  constructor(private readonly reportingService: ReportingService) {}

  @Get('dashboard')
  async dashboard() {
    return this.reportingService.dashboardSummary();
  }
}

@Controller('reports')
export class RegulatoryReportController {
  constructor(private readonly reportingService: ReportingService) {}

  @Get('regulatory-summary')
  @Roles('Super Admin', 'Finance Manager', 'Internal Auditor')
  async regulatorySummary(@Query('period') period: string) {
    return this.reportingService.regulatorySummary(period);
  }
}

@Controller('ai-assistant')
export class AiAssistantController {
  constructor(private readonly reportingService: ReportingService) {}

  @Post('ask')
  async ask(@Body() dto: AskAiDto) {
    const answer = await this.reportingService.ask(dto.question);
    return { answer };
  }
}
