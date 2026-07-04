import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as webpush from 'web-push';
import { PrismaService } from '../../prisma/prisma.service';

export interface PushPayload {
  title: string;
  body?: string;
  link?: string;
  type?: string;
}

@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger(PushService.name);
  private enabled = false;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    const pub = process.env.VAPID_PUBLIC_KEY;
    const priv = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT ?? 'mailto:admin@luxgrimoire.com';
    if (pub && priv) {
      webpush.setVapidDetails(subject, pub, priv);
      this.enabled = true;
      this.logger.log('Web Push enabled');
    } else {
      this.logger.warn('VAPID keys not configured — Web Push disabled');
    }
  }

  async sendToUser(userId: string, payload: PushPayload): Promise<void> {
    if (!this.enabled) return;
    const subs = await this.prisma.pushSubscription.findMany({ where: { userId } });
    await Promise.all(subs.map(sub => this.sendToSubscription(sub, payload)));
  }

  private async sendToSubscription(
    sub: { id: string; endpoint: string; p256dh: string; auth: string },
    payload: PushPayload,
  ): Promise<void> {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload),
        { TTL: 86400 },
      );
    } catch (err: any) {
      if (err.statusCode === 410 || err.statusCode === 404) {
        // Subscription expired — remove it
        await this.prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => null);
        this.logger.debug(`Removed expired push subscription ${sub.id}`);
      } else {
        this.logger.warn(`Push failed for sub ${sub.id}: ${err.message}`);
        await this.prisma.pushSubscription
          .update({ where: { id: sub.id }, data: { lastError: String(err.message), failedAt: new Date() } })
          .catch(() => null);
      }
    }
  }
}
