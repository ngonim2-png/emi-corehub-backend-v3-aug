import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { LifecycleTriggersService } from '../modules/marketing-automation/lifecycle-triggers.service';

@Processor('jobs')
export class LifecycleTriggersProcessor extends WorkerHost {
  private readonly logger = new Logger(LifecycleTriggersProcessor.name);

  constructor(private readonly triggersService: LifecycleTriggersService) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== 'lifecycle-triggers') return;
    const results = await this.triggersService.runAllTriggers();
    const total = results.reduce((sum, r) => sum + r.fired, 0);
    this.logger.log(`Lifecycle triggers: ${total} message(s) queued across ${results.length} active trigger(s)`);
  }
}
