import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuditLog } from '../../common/decorators/audit-log.decorator';
import { BeneficiariesService } from './beneficiaries.service';
import { CreateBeneficiaryDto } from './dto/create-beneficiary.dto';

@Controller('beneficiaries')
export class BeneficiariesController {
  constructor(private readonly beneficiariesService: BeneficiariesService) {}

  @Post()
  @AuditLog({ action: 'beneficiary.added', entityType: 'beneficiary' })
  async create(@Body() dto: CreateBeneficiaryDto) {
    return this.beneficiariesService.create(dto);
  }

  @Get()
  async findByClient(@Query('clientId') clientId: string) {
    return this.beneficiariesService.findByClient(clientId);
  }

  @Delete(':id')
  @Roles('Super Admin', 'Underwriting Officer', 'Branch Manager')
  @AuditLog({ action: 'beneficiary.removed', entityType: 'beneficiary' })
  async remove(@Param('id') id: string) {
    await this.beneficiariesService.remove(id);
    return { removed: true };
  }
}
