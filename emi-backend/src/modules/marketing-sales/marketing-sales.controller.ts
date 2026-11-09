import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuditLog } from '../../common/decorators/audit-log.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { MarketingSalesService } from './marketing-sales.service';
import { SetTargetDto } from './dto/set-target.dto';

@Controller('marketing')
export class MarketingSalesController {
  constructor(private readonly marketingSalesService: MarketingSalesService) {}

  @Post('targets')
  @Roles('Super Admin', 'Branch Manager')
  async setTarget(@Body() dto: SetTargetDto) {
    return this.marketingSalesService.setTarget(dto);
  }

  @Get('targets')
  async findByMonth(@Query('month') month: string) {
    return this.marketingSalesService.findByMonth(month);
  }

  @Post('commission-rates')
  @Roles('Super Admin', 'Finance Manager')
  async setCommissionRate(@Body('marketerId') marketerId: string, @Body('ratePct') ratePct: number) {
    return this.marketingSalesService.setCommissionRate(marketerId, ratePct);
  }

  @Get('commission-rates')
  async findRates() {
    return this.marketingSalesService.findRates();
  }

  @Get('commissions')
  async commissionSummary(@Query('period') period: string) {
    return this.marketingSalesService.commissionSummary(period);
  }

  @Post('commissions/pay')
  @Roles('Super Admin', 'Finance Manager')
  @AuditLog({ action: 'commission.paid', entityType: 'commission_payout' })
  async payCommission(
    @Body('marketerId') marketerId: string,
    @Body('period') period: string,
    @Body('amount') amount: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.marketingSalesService.payCommission(marketerId, period, amount, user.id);
  }
}
