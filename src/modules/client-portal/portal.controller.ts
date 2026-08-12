import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { PortalAuthService } from './portal-auth.service';
import { PortalAuthGuard } from './portal-auth.guard';
import { PortalDataService } from './portal-data.service';
import { PortalLoginDto } from './dto/portal-login.dto';

@Controller('portal')
@Public()
export class PortalController {
  constructor(
    private readonly portalAuthService: PortalAuthService,
    private readonly portalDataService: PortalDataService,
  ) {}

  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 300_000 } })
  async login(@Body() dto: PortalLoginDto) {
    return this.portalAuthService.login(dto.policyNo, dto.phone);
  }

  @Get('me')
  @UseGuards(PortalAuthGuard)
  async me(@Req() req: any) {
    return this.portalDataService.getMyPortalData(req.portalClientId);
  }
}
