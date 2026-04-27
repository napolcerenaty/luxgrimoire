import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { SupportedGroupBy } from './analytics.dto';

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
   * Uses raw parameterized SQL — never loads individual events.
   */
  async query(params: {
    eventType: string;
    groupBy: SupportedGroupBy;
    periodDays?: number;
    limit: number;
  }): Promise<{ label: string; count: number }[]> {
    const { eventType, groupBy, periodDays, limit } = params;

    // groupBy is validated upstream via @IsIn — safe to use in SQL identifiers
    let selectExpr: string;
    let groupByExpr: string;
    switch (groupBy) {
      case 'entity':
        selectExpr = "COALESCE(entity_name, entity_id, '(unknown)') as label";
        groupByExpr = 'entity_id, entity_name';
        break;
      case 'value':
        selectExpr = "COALESCE(value, '(none)') as label";
        groupByExpr = 'value';
        break;
      case 'user':
        selectExpr = "COALESCE(user_id, '(anonymous)') as label";
        groupByExpr = 'user_id';
        break;
      case 'day':
        selectExpr = "TO_CHAR(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') as label";
        groupByExpr = "TO_CHAR(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD')";
        break;
      case 'month':
        selectExpr = "TO_CHAR(created_at AT TIME ZONE 'UTC', 'YYYY-MM') as label";
        groupByExpr = "TO_CHAR(created_at AT TIME ZONE 'UTC', 'YYYY-MM')";
        break;
      default:
        selectExpr = "COALESCE(entity_name, entity_id, '(unknown)') as label";
        groupByExpr = 'entity_id, entity_name';
    }

    const rows = periodDays
      ? await this.prisma.$queryRawUnsafe<{ label: string; count: bigint }[]>(
          `SELECT ${selectExpr}, COUNT(*) as count
           FROM analytics_events
           WHERE event_type = $1
             AND created_at >= NOW() - ($2 * INTERVAL '1 day')
           GROUP BY ${groupByExpr}
           ORDER BY count DESC
           LIMIT $3`,
          eventType,
          periodDays,
          limit,
        )
      : await this.prisma.$queryRawUnsafe<{ label: string; count: bigint }[]>(
          `SELECT ${selectExpr}, COUNT(*) as count
           FROM analytics_events
           WHERE event_type = $1
           GROUP BY ${groupByExpr}
           ORDER BY count DESC
           LIMIT $2`,
          eventType,
          limit,
        );

    return rows.map((r) => ({ label: r.label, count: Number(r.count) }));
  }
}
