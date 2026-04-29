import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { SupportedGroupBy } from './analytics.dto';

/** Pre-built safe SQL fragments per groupBy option — avoids $queryRawUnsafe string interpolation */
const SELECT_FRAGMENTS: Record<SupportedGroupBy, Prisma.Sql> = {
  entity: Prisma.raw("COALESCE(entity_name, entity_id, '(unknown)') as label"),
  value:  Prisma.raw("COALESCE(value, '(none)') as label"),
  user:   Prisma.raw("COALESCE(user_id, '(anonymous)') as label"),
  day:    Prisma.raw("TO_CHAR(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') as label"),
  month:  Prisma.raw("TO_CHAR(created_at AT TIME ZONE 'UTC', 'YYYY-MM') as label"),
};

const GROUP_BY_FRAGMENTS: Record<SupportedGroupBy, Prisma.Sql> = {
  entity: Prisma.raw('entity_id, entity_name'),
  value:  Prisma.raw('value'),
  user:   Prisma.raw('user_id'),
  day:    Prisma.raw("TO_CHAR(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD')"),
  month:  Prisma.raw("TO_CHAR(created_at AT TIME ZONE 'UTC', 'YYYY-MM')"),
};

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Fire-and-forget event tracking. Never throws, never blocks.
   */
  track(event: {
    eventType: string;
    userId?: string | null;
    entityType?: string;
    entityId?: string;
    entityName?: string;
    value?: string;
  }) {
    this.prisma.analyticsEvent
      .create({
        data: {
          eventType: event.eventType,
          userId: event.userId ?? null,
          entityType: event.entityType ?? null,
          entityId: event.entityId ?? null,
          entityName: event.entityName ?? null,
          value: event.value ?? null,
        },
      })
      .catch(() => {}); // intentionally swallowed
  }

  /**
   * Aggregation query for admin panel.
   * Returns up to `limit` rows of { label, count } ordered by count DESC.
   * Uses Prisma.sql tagged templates — parameters are always bound, never interpolated.
   */
  async query(params: {
    eventType: string;
    groupBy: SupportedGroupBy;
    periodDays?: number;
    limit: number;
  }): Promise<{ label: string; count: number }[]> {
    const { eventType, groupBy, periodDays, limit } = params;
    const sel = SELECT_FRAGMENTS[groupBy] ?? SELECT_FRAGMENTS.entity;
    const grp = GROUP_BY_FRAGMENTS[groupBy] ?? GROUP_BY_FRAGMENTS.entity;

    const rows = periodDays
      ? await this.prisma.$queryRaw<{ label: string; count: bigint }[]>(
          Prisma.sql`SELECT ${sel}, COUNT(*) as count
                     FROM analytics_events
                     WHERE event_type = ${eventType}
                       AND created_at >= NOW() - (${periodDays} * INTERVAL '1 day')
                     GROUP BY ${grp}
                     ORDER BY count DESC
                     LIMIT ${limit}`,
        )
      : await this.prisma.$queryRaw<{ label: string; count: bigint }[]>(
          Prisma.sql`SELECT ${sel}, COUNT(*) as count
                     FROM analytics_events
                     WHERE event_type = ${eventType}
                     GROUP BY ${grp}
                     ORDER BY count DESC
                     LIMIT ${limit}`,
        );

    return rows.map((r) => ({ label: r.label, count: Number(r.count) }));
  }
}
