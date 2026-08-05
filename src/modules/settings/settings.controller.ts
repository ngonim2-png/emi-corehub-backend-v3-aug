import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * These values are configured via environment variables (see
 * src/config/configuration.ts and .env.example), not editable through
 * the API in this scaffold - changing arrears/lapse behaviour in
 * production should go through the same review as any other business
 * rule change, not a live-editable settings screen. This endpoint exists
 * so the frontend can display the values actually in effect rather than
 * guessing or hardcoding them.
 */
@Controller('settings')
export class SettingsController {
  constructor(private readonly config: ConfigService) {}

  @Get('business-rules')
  async businessRules() {
    return {
      companyName: 'Enhanced Mutual Insurance (SL) Ltd',
      currency: 'NLe',
      premiumDueDay: this.config.get<number>('businessRules.premiumDueDay'),
      warningThresholdMonths: this.config.get<number>('businessRules.warningThresholdMonths'),
      lapseThresholdMonths: this.config.get<number>('businessRules.lapseThresholdMonths'),
    };
  }
}
