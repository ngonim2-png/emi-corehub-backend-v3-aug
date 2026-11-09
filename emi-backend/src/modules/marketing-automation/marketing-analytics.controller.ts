import { Controller, Get } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { MarketingAnalyticsService } from './marketing-analytics.service';

@Controller('marketing/analytics')
@Roles('Super Admin', 'Branch Manager', 'Finance Manager')
export class MarketingAnalyticsController {
  constructor(private readonly analyticsService: MarketingAnalyticsService) {}

  @Get()
  async overview() {
    return this.analyticsService.overview();
  }
}
