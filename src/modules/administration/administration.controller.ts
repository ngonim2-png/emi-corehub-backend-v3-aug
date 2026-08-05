import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuditLog } from '../../common/decorators/audit-log.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { AdministrationService } from './administration.service';
import { CreateAssetDto, CreateProcurementRequestDto, CreateSupplierDto } from './dto/administration.dto';

@Controller('administration')
export class AdministrationController {
  constructor(private readonly administrationService: AdministrationService) {}

  @Post('assets')
  @Roles('Super Admin', 'Branch Manager')
  async createAsset(@Body() dto: CreateAssetDto) {
    return this.administrationService.createAsset(dto);
  }

  @Get('assets')
  async findAssets() {
    return this.administrationService.findAssets();
  }

  @Get('assets/:id/depreciation-schedule')
  async depreciationSchedule(@Param('id') id: string) {
    return this.administrationService.depreciationSchedule(id);
  }

  @Post('assets/depreciation/run')
  @Roles('Super Admin', 'Finance Manager')
  async runDepreciation(@Body('period') period: string, @CurrentUser() user: AuthenticatedUser) {
    return this.administrationService.runMonthlyDepreciation(period, user);
  }

  @Post('procurement-requests')
  async createProcurementRequest(@Body() dto: CreateProcurementRequestDto) {
    return this.administrationService.createProcurementRequest(dto);
  }

  @Get('procurement-requests')
  async findProcurementRequests() {
    return this.administrationService.findProcurementRequests();
  }

  @Get('procurement-requests/ap-aging')
  @Roles('Super Admin', 'Finance Manager')
  async apAging() {
    return this.administrationService.apAging();
  }

  @Post('procurement-requests/:id/approve')
  @Roles('Super Admin', 'Finance Manager', 'Branch Manager')
  @AuditLog({ action: 'procurement.approved', entityType: 'procurement_request' })
  async approveProcurementRequest(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.administrationService.approveProcurementRequest(id, user);
  }

  @Post('procurement-requests/:id/pay')
  @Roles('Super Admin', 'Finance Manager')
  async payProcurementRequest(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.administrationService.payProcurementRequest(id, user);
  }

  @Post('suppliers')
  @Roles('Super Admin', 'Branch Manager', 'Finance Manager')
  async createSupplier(@Body() dto: CreateSupplierDto) {
    return this.administrationService.createSupplier(dto);
  }

  @Get('suppliers')
  async findSuppliers() {
    return this.administrationService.findSuppliers();
  }
}
