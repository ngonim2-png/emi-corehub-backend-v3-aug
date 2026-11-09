import { Body, Controller, Post, BadRequestException } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuditLog } from '../../common/decorators/audit-log.decorator';
import { Ifrs17BatchCloseProcessor } from '../../jobs/ifrs17-batch-close.processor';

/**
 * Manual "run now" trigger for the IFRS 17 batch close, using the same
 * calculation logic as the scheduled monthly job (see
 * ifrs17-batch-close.processor.ts) - not a separate implementation.
 * Runs synchronously rather than through the job queue so Finance gets
 * an immediate result instead of having to poll or wait.
 */
@Controller('ifrs17')
@Roles('Super Admin', 'Finance Manager')
export class Ifrs17Controller {
  constructor(private readonly processor: Ifrs17BatchCloseProcessor) {}

  @Post('run-batch-close')
  @AuditLog({ action: 'ifrs17.manual_batch_close', entityType: 'ifrs17_measurement' })
  async runBatchClose(@Body('period') period: string) {
    if (!period || !/^\d{4}-\d{2}$/.test(period)) {
      throw new BadRequestException('period is required and must be in YYYY-MM format.');
    }
    return this.processor.runForPeriod(period);
  }
}
