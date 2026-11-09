import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuditLog } from '../../common/decorators/audit-log.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { WalletsService } from './wallets.service';
import { AllocateTokensDto } from './dto/allocate-tokens.dto';

@Controller('wallets')
export class WalletsController {
  constructor(private readonly walletsService: WalletsService) {}

  @Get(':marketerId/balance')
  async getBalance(@Param('marketerId') marketerId: string) {
    return this.walletsService.getBalance(marketerId);
  }

  @Get(':marketerId/transactions')
  async getTransactions(@Param('marketerId') marketerId: string) {
    return this.walletsService.findTransactions(marketerId);
  }

  @Post('allocate')
  @Roles('Super Admin', 'Finance Manager')
  @AuditLog({ action: 'wallet.token_allocated', entityType: 'marketer_wallet' })
  async allocate(@Body() dto: AllocateTokensDto, @CurrentUser() user: AuthenticatedUser) {
    await this.walletsService.allocate(dto.marketerId, dto.amount, user);
    return this.walletsService.getBalance(dto.marketerId);
  }

  @Post(':marketerId/confirm-deposit')
  @Roles('Super Admin', 'Finance Manager')
  @AuditLog({ action: 'wallet.deposit_confirmed', entityType: 'marketer_wallet' })
  async confirmDeposit(
    @Param('marketerId') marketerId: string,
    @Body('amount') amount: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.walletsService.confirmDeposit(marketerId, amount, user);
    return this.walletsService.getBalance(marketerId);
  }
}
