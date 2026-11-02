import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import * as webpush from 'web-push';
import { AppPushSubscriptionEntity } from './entities/app-push-subscription.entity';
import { AppNotificationEntity } from './entities/app-notification.entity';

export type SubjectType = 'client' | 'applicant';

/**
 * Every notification is written to the in-app inbox first, then pushed to
 * any devices that have allowed notifications. A failed or missing push
 * therefore never means a lost message - it is still in the inbox.
 */
@Injectable()
export class AppPushService {
  private readonly logger = new Logger(AppPushService.name);
  private readonly enabled: boolean;

  constructor(
    @InjectRepository(AppPushSubscriptionEntity) private readonly subsRepo: Repository<AppPushSubscriptionEntity>,
    @InjectRepository(AppNotificationEntity) private readonly notifRepo: Repository<AppNotificationEntity>,
    private readonly config: ConfigService,
  ) {
    const pub = this.config.get<string>('clientApp.vapidPublicKey');
    const priv = this.config.get<string>('clientApp.vapidPrivateKey');
    const subject = this.config.get<string>('clientApp.vapidSubject') || 'mailto:admin@enhancedmutual.sl';
    this.enabled = !!(pub && priv);
    if (this.enabled) {
      webpush.setVapidDetails(subject, pub!, priv!);
    } else {
      this.logger.warn('VAPID keys not set - push notifications are disabled (the in-app inbox still works).');
    }
  }

  get publicKey(): string {
    return this.config.get<string>('clientApp.vapidPublicKey') || '';
  }

  async subscribe(subjectType: SubjectType, subjectId: string, sub: { endpoint: string; keys: { p256dh: string; auth: string } }) {
    const existing = await this.subsRepo.findOne({ where: { endpoint: sub.endpoint } });
    if (existing) {
      // The same device can move between accounts (shared phone) - it follows whoever subscribed last.
      await this.subsRepo.update(existing.id, { subjectType, subjectId, p256dh: sub.keys.p256dh, auth: sub.keys.auth });
      return;
    }
    await this.subsRepo.save(this.subsRepo.create({ subjectType, subjectId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth }));
  }

  async unsubscribe(endpoint: string) {
    await this.subsRepo.delete({ endpoint });
  }

  /** Stores in the inbox and pushes to every subscribed device. Never throws - a notification failure must never break the business action that triggered it. */
  async notify(subjectType: SubjectType, subjectId: string, title: string, body: string): Promise<{ pushed: number }> {
    try {
      await this.notifRepo.save(this.notifRepo.create({ subjectType, subjectId, title, body }));
    } catch (e) {
      this.logger.error(`Could not store notification: ${(e as Error).message}`);
    }
    return this.pushOnly(subjectType, subjectId, title, body);
  }

  private async pushOnly(subjectType: SubjectType, subjectId: string, title: string, body: string): Promise<{ pushed: number }> {
    if (!this.enabled) return { pushed: 0 };
    const subs = await this.subsRepo.find({ where: { subjectType, subjectId } });
    let pushed = 0;
    const payload = JSON.stringify({ title, body, url: '/app/' });
    for (const s of subs) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 60 * 60 * 24 });
        pushed++;
      } catch (e: any) {
        if (e?.statusCode === 404 || e?.statusCode === 410) {
          await this.subsRepo.delete({ id: s.id }).catch(() => undefined);
        } else {
          this.logger.warn(`Push failed (${e?.statusCode ?? 'n/a'}): ${e?.message ?? e}`);
        }
      }
    }
    return { pushed };
  }

  async notifyMany(subjectType: SubjectType, subjectIds: string[], title: string, body: string): Promise<{ recipients: number; devices: number }> {
    let devices = 0;
    for (const id of subjectIds) {
      const r = await this.notify(subjectType, id, title, body);
      devices += r.pushed;
    }
    return { recipients: subjectIds.length, devices };
  }

  async deviceCounts(): Promise<{ clientsWithPush: number; devices: number }> {
    const rows = await this.subsRepo
      .createQueryBuilder('s')
      .select('COUNT(DISTINCT s."subjectId")', 'clients')
      .addSelect('COUNT(*)', 'devices')
      .where("s.\"subjectType\" = 'client'")
      .getRawOne();
    return { clientsWithPush: Number(rows.clients), devices: Number(rows.devices) };
  }

  async listInbox(subjectType: SubjectType, subjectId: string) {
    return this.notifRepo.find({ where: { subjectType, subjectId }, order: { createdAt: 'DESC' }, take: 50 });
  }

  async markAllRead(subjectType: SubjectType, subjectId: string) {
    await this.notifRepo
      .createQueryBuilder()
      .update()
      .set({ readAt: () => 'now()' })
      .where('"subjectType" = :subjectType AND "subjectId" = :subjectId AND "readAt" IS NULL', { subjectType, subjectId })
      .execute();
  }

  async unreadCount(subjectType: SubjectType, subjectId: string): Promise<number> {
    return this.notifRepo.count({ where: { subjectType, subjectId, readAt: null as any } });
  }
}
