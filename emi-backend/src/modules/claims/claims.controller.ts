import { Body, Controller, Get, Param, Post, Res } from '@nestjs/common';
import { Response } from 'express';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuditLog } from '../../common/decorators/audit-log.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { ClaimsService } from './claims.service';
import { CreateClaimDto } from './dto/create-claim.dto';
import { buildExcelExport } from '../../common/utils/excel-export.util';
import { sendExcelFile } from '../../common/utils/send-excel-file.util';

@Controller('claims')
export class ClaimsController {
  constructor(private readonly claimsService: ClaimsService) {}

  @Post()
  @AuditLog({ action: 'claim.registered', entityType: 'claim' })
  async create(@Body() dto: CreateClaimDto) {
    return this.claimsService.create(dto);
  }

  @Get('export')
  async exportClaims(@Res() res: Response) {
    const claims = await this.claimsService.findAll();
    const buffer = await buildExcelExport(
      'Claims',
      [
        { header: 'Claim No', key: 'claimNo', width: 18 },
        { header: 'Client', key: 'clientName', width: 24 },
        { header: 'Policy No', key: 'policyNo', width: 20 },
        { header: 'Type', key: 'claimType', width: 16 },
        { header: 'Status', key: 'status', width: 16 },
        { header: 'Amount Claimed', key: 'amountClaimed', width: 16, numeric: true },
        { header: 'Amount Approved', key: 'amountApproved', width: 16, numeric: true },
        { header: 'Date Reported', key: 'dateReported', width: 14 },
        { header: 'Date Paid', key: 'datePaid', width: 14 },
      ],
      claims.map((c) => ({
        claimNo: c.claimNo, clientName: c.policy?.client?.fullName ?? '', policyNo: c.policy?.policyNo ?? '',
        claimType: c.claimType, status: c.status, amountClaimed: Number(c.amountClaimed),
        amountApproved: c.amountApproved ? Number(c.amountApproved) : '', dateReported: c.dateReported, datePaid: c.datePaid ?? '',
      })),
      'Claims',
    );
    sendExcelFile(res, buffer, 'claims.xlsx');
  }

  @Get()
  async findAll() {
    return this.claimsService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.claimsService.findOne(id);
  }

  @Post(':id/advance')
  @Roles('Super Admin', 'Claims Officer')
  @AuditLog({ action: 'claim.advanced', entityType: 'claim' })
  async advance(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body('datePaid') datePaid?: string,
    @Body('paymentMethod') paymentMethod?: string,
  ) {
    return this.claimsService.advance(id, user, { datePaid, paymentMethod });
  }

  @Post(':id/reject')
  @Roles('Super Admin', 'Claims Officer')
  @AuditLog({ action: 'claim.rejected', entityType: 'claim' })
  async reject(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.claimsService.reject(id, user);
  }

  @Post(':id/reserve')
  @Roles('Super Admin', 'Claims Officer', 'Finance Manager')
  @AuditLog({ action: 'claim.reserve_set', entityType: 'claim' })
  async setReserve(@Param('id') id: string, @Body('reserveAmount') reserveAmount: number) {
    return this.claimsService.setReserve(id, reserveAmount);
  }
}
