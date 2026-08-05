import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class SchedulerService implements OnModuleInit {
  constructor(@InjectQueue('jobs') private readonly jobsQueue: Queue) {}

  async onModuleInit(): Promise<void> {
    // Nightly, 1am: recompute every policy's arrears/lapse status.
    await this.jobsQueue.add(
      'lapse-detection',
      {},
      { repeat: { pattern: '0 1 * * *' }, jobId: 'lapse-detection-nightly' },
    );

    // Nightly, 1:30am: flag marketers with stale unreconciled cash.
    await this.jobsQueue.add(
      'wallet-reconciliation',
      {},
      { repeat: { pattern: '30 1 * * *' }, jobId: 'wallet-reconciliation-nightly' },
    );

    // Nightly, 2am: freeze/expire tokens per configured rules.
    await this.jobsQueue.add(
      'token-expiry',
      {},
      { repeat: { pattern: '0 2 * * *' }, jobId: 'token-expiry-nightly' },
    );

    // Month-end, 3am on the 1st: IFRS 17 batch close for the prior month.
    await this.jobsQueue.add(
      'ifrs17-batch-close',
      { period: 'previous-month' },
      { repeat: { pattern: '0 3 1 * *' }, jobId: 'ifrs17-batch-close-monthly' },
    );

    // Nightly, 4am: check every active lifecycle trigger (welcome, warning,
    // win-back, renewal reminders, anniversaries, referral rewards) and
    // queue any messages that haven't already fired.
    await this.jobsQueue.add(
      'lifecycle-triggers',
      {},
      { repeat: { pattern: '0 4 * * *' }, jobId: 'lifecycle-triggers-nightly' },
    );
  }
}
