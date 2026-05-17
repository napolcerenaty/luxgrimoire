import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SubscriberCountReconcileCronService {
  private readonly logger = new Logger(SubscriberCountReconcileCronService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Runs on the 15th of each month at 03:00 UTC — well after any renewal processing */
  @Cron('0 3 15 * *', { name: 'subscriber-count-reconcile' })
  async reconcile(): Promise<void> {
    this.logger.log('[SubscriberCount] Starting monthly reconciliation');
    try {
      await this.reconcileAll();
      this.logger.log('[SubscriberCount] Reconciliation complete');
    } catch (err) {
      this.logger.error('[SubscriberCount] Reconciliation failed', err);
    }
  }

  async reconcileAll(): Promise<void> {
    // Get live counts per subscription
    const liveCounts = await this.prisma.userSubscriptionEntry.groupBy({
      by: ['subscriptionId'],
      where: { active: true },
      _count: { id: true },
    });

    // Also get all subscriptions that have a snapshot (may have drifted to 0)
    const snapshots = await this.prisma.subscriptionStatsSnapshot.findMany({
      select: { subscriptionId: true, subscriberCount: true },
    });

    const liveMap = new Map(liveCounts.map(r => [r.subscriptionId, r._count.id]));
    const snapshotMap = new Map(snapshots.map(s => [s.subscriptionId, s.subscriberCount]));

    // All subscription IDs that need updating
    const allIds = new Set([...liveMap.keys(), ...snapshotMap.keys()]);

    let updated = 0;
    for (const subscriptionId of allIds) {
      const live = liveMap.get(subscriptionId) ?? 0;
      const snapshot = snapshotMap.get(subscriptionId) ?? null;

      if (snapshot === live) continue; // no drift

      await this.prisma.$executeRaw`
        INSERT INTO subscription_stats_snapshots ("subscriptionId", "subscriberCount", "updatedAt")
        VALUES (${subscriptionId}, ${live}, NOW())
        ON CONFLICT ("subscriptionId") DO UPDATE
        SET "subscriberCount" = ${live},
            "updatedAt" = NOW()
      `;
      updated++;
    }

    this.logger.log(`[SubscriberCount] Reconciled ${updated} subscription(s) out of ${allIds.size}`);
  }
}
