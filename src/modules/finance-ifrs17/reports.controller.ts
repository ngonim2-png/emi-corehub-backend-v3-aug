import { Controller, Get, Param, Query } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JournalService } from './journal.service';
import { ChartOfAccountEntity } from './entities/chart-of-account.entity';
import { Ifrs17GroupEntity } from './entities/ifrs17-group.entity';
import { Ifrs17MeasurementEntity } from './entities/ifrs17-measurement.entity';

@Controller()
export class ReportsController {
  constructor(
    private readonly journalService: JournalService,
    @InjectRepository(ChartOfAccountEntity)
    private readonly accountsRepo: Repository<ChartOfAccountEntity>,
    @InjectRepository(Ifrs17GroupEntity)
    private readonly ifrs17GroupsRepo: Repository<Ifrs17GroupEntity>,
    @InjectRepository(Ifrs17MeasurementEntity)
    private readonly ifrs17MeasurementsRepo: Repository<Ifrs17MeasurementEntity>,
  ) {}

  @Get('accounts')
  async listAccounts() {
    return this.accountsRepo.find({ order: { code: 'ASC' } });
  }

  @Get('reports/trial-balance')
  async trialBalance(@Query('from') from?: string, @Query('to') to?: string) {
    return this.journalService.trialBalance(from, to);
  }

  @Get('accounts/:code/ledger')
  async accountLedger(
    @Param('code') code: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.journalService.accountLedger(code, from, to);
  }

  @Get('ifrs17/groups')
  async ifrs17Groups() {
    return this.ifrs17GroupsRepo.find({ relations: ['product'] });
  }

  @Get('ifrs17/measurements')
  async ifrs17Measurements() {
    return this.ifrs17MeasurementsRepo.find({
      relations: ['group', 'group.product'],
      order: { computedAt: 'DESC' },
      take: 100,
    });
  }
}
