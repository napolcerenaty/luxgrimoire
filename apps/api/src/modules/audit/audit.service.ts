import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  async log(params: {
    userId?: string;
    username?: string;
    action: string;
    entityType: string;
    entityId?: string;
    entityTitle?: string;
    metadata?: Record<string, unknown>;
  }) {
    try {
      await this.prisma.auditLog.create({
        data: {
          userId: params.userId ?? null,
          username: params.username,
          action: params.action,
          entityType: params.entityType,
          entityId: params.entityId,
          entityTitle: params.entityTitle,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          metadata: params.metadata as any,
        },
      });
    } catch {
      // never break the main request
    }
  }
}
