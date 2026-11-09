import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

/**
 * Placeholder for the "tokens may expire, become frozen, or require
 * reauthorization if not reconciled within a defined period" rule from
 * the specification. A real implementation would mark affected
 * wallet_transactions rows (or a dedicated freeze flag) and emit a
 * notification - left as a stub since the exact freeze semantics are a
 * product decision, not an engineering one.
 */
@Processor('jobs')
export class TokenExpiryProcessor extends WorkerHost {
  private readonly logger = new Logger(TokenExpiryProcessor.name);

  async process(job: Job): Promise<void> {
    if (job.name !== 'token-expiry') return;
    this.logger.log('Token expiry sweep ran (stub - implement freeze rules per product policy)');
  }
}
