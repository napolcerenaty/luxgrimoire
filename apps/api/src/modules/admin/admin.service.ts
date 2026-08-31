import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuditLogQueryDto, RecentEditionsQueryDto, AssignRoleDto, UserQueryDto, SetMaintenanceDto } from './admin.dto';
import { Role } from '@prisma/client';
import { UploadService } from '../upload/upload.service';
import { refreshNextRenewalDate } from '../../common/utils/renewal-date.util';
import { bookAuthorsInclude } from '../../common/prisma-includes';
import { parsePagination, buildPageMeta } from '../../common/pagination';

const MAINTENANCE_KEY = 'system:maintenance';
const MAINTENANCE_TTL = 365 * 24 * 60 * 60 * 1000; // 365 days in ms

const DASHBOARD_COUNTS_KEY = 'admin:dashboard:counts';
const DASHBOARD_COUNTS_TTL = 30_000; // 30 seconds

export interface MaintenanceState { enabled: boolean; message: string }

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploadService: UploadService,
    private readonly auditService: AuditService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  async getMaintenance(): Promise<MaintenanceState> {
    const state = await this.cache.get<MaintenanceState>(MAINTENANCE_KEY);
    return state ?? { enabled: false, message: "We'll be back shortly. Thank you for your patience." };
  }

  async setMaintenance(dto: SetMaintenanceDto): Promise<MaintenanceState> {
    const state: MaintenanceState = {
      enabled: dto.enabled,
      message: dto.message ?? "We'll be back shortly. Thank you for your patience.",
    };
    await this.cache.set(MAINTENANCE_KEY, state, MAINTENANCE_TTL);
    return state;
  }

  async getAuditLogs(query: AuditLogQueryDto) {
    const { skip, take: pageSize, page } = parsePagination({ page: query.page, pageSize: query.pageSize ?? 30 });
    const sortBy = query.sortBy ?? 'createdAt';
    const order = (query.order ?? 'desc') as 'asc' | 'desc';

    const where: Record<string, unknown> = {};
    if (query.entityType) where.entityType = query.entityType;
    if (query.action) where.action = query.action;
    if (query.userId) where.userId = query.userId;
    if (query.search) {
      where.OR = [
        { username: { contains: query.search, mode: 'insensitive' } },
        { action: { contains: query.search, mode: 'insensitive' } },
        { entityType: { contains: query.search, mode: 'insensitive' } },
        { entityTitle: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const orderBy: Record<string, string> = { [sortBy]: order };

    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        skip,
        take: pageSize,
        orderBy,
        include: { user: { select: { id: true, username: true, email: true, role: true } } },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { data, ...buildPageMeta(total, page, pageSize) };
  }

  async getRecentEditions(query: RecentEditionsQueryDto) {
    const { skip, take: pageSize, page } = parsePagination({ page: query.page, pageSize: query.pageSize ?? 30 });
    const sortBy = query.sortBy ?? 'updatedAt';
    const order = (query.order ?? 'desc') as 'asc' | 'desc';

    const where: Record<string, unknown> = {};

    if (query.search) {
      where.OR = [
        { slug: { contains: query.search, mode: 'insensitive' } },
        { publisher: { contains: query.search, mode: 'insensitive' } },
        { bookBoxCompany: { name: { contains: query.search, mode: 'insensitive' } } },
        { book: { title: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    const orderBy: Record<string, string> = { [sortBy]: order };

    const [data, total] = await Promise.all([
      this.prisma.bookEdition.findMany({
        where,
        skip,
        take: pageSize,
        orderBy,
        select: {
          id: true,
          slug: true,
          publisher: true,
          verifiedAt: true,
          createdAt: true,
          book: {
            select: {
              id: true,
              slug: true,
              title: true,
              seriesName: true,
              volumeNumbers: true,
              ...bookAuthorsInclude,
            },
          },
          bookBoxCompany: { select: { id: true, name: true, slug: true } },
        },
      }),
      this.prisma.bookEdition.count({ where }),
    ]);

    // Enrich with last audit log action per edition.
    // distinct + ORDER BY across the whole table is expensive: bound the scan
    // with a 90-day window so PostgreSQL can use the (createdAt) index.
    const editionIds = data.map((e) => e.id);
    const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
    const lastAuditLogs = editionIds.length
      ? await this.prisma.auditLog.findMany({
          where: {
            entityId: { in: editionIds },
            entityType: 'edition',
            createdAt: { gte: new Date(Date.now() - NINETY_DAYS_MS) },
          },
          orderBy: { createdAt: 'desc' },
          distinct: ['entityId'],
          select: { entityId: true, action: true, username: true, userId: true, createdAt: true },
        })
      : [];

    const auditByEditionId = new Map(lastAuditLogs.map((l) => [l.entityId, l]));

    const enriched = data.map((edition) => ({
      ...edition,
      lastAudit: auditByEditionId.get(edition.id) ?? null,
    }));

    return { data: enriched, ...buildPageMeta(total, page, pageSize) };
  }

  async assignRole(userId: string, dto: AssignRoleDto, actor: { id: string; username: string }) {
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        role: dto.role as Role,
        managedCompanyId: dto.role === 'COMPANY_MANAGER' ? (dto.managedCompanyId ?? null) : null,
      },
      select: { id: true, username: true, email: true, role: true, managedCompanyId: true },
    });

    // Invalidate cached role so the change takes effect on next request
    void this.cache.del(`user-meta:${userId}`);

    void this.auditService.log({
      userId: actor.id,
      username: actor.username,
      action: 'assign_role',
      entityType: 'user',
      entityId: userId,
      entityTitle: updated.username,
      metadata: { newRole: dto.role },
    });

    return updated;
  }

  async getUsers(query: UserQueryDto) {
    const { skip, take: pageSize, page } = parsePagination({ page: query.page, pageSize: query.pageSize ?? 20 });
    const where = query.search
      ? {
          OR: [
            { username: { contains: query.search, mode: 'insensitive' as const } },
            { email: { contains: query.search, mode: 'insensitive' as const } },
          ],
        }
      : {};
    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: pageSize,
        select: {
          id: true,
          username: true,
          email: true,
          role: true,
          managedCompanyId: true,
          createdAt: true,
          lastLoginAt: true,
          managedCompany: { select: { name: true, slug: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);
    return { data, ...buildPageMeta(total, page, pageSize) };
  }

  async deleteUser(userId: string, actor: { id: string; username: string }) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, username: true, avatarUrl: true },
    });
    if (!user) throw new Error('User not found');

    // Delete avatar from Cloudinary before removing the DB record
    if (user.avatarUrl) {
      const publicId = this.extractCloudinaryPublicId(user.avatarUrl);
      if (publicId) {
        try {
          await this.uploadService.deleteImage(publicId);
        } catch {
          // Non-fatal: proceed with user deletion even if Cloudinary fails
        }
      }
    }

    await this.prisma.user.delete({ where: { id: userId } });

    void this.auditService.log({
      userId: actor.id,
      username: actor.username,
      action: 'delete_user',
      entityType: 'user',
      entityId: userId,
      entityTitle: user.username,
      metadata: { email: user.email },
    });

    return { deleted: true, email: user.email, username: user.username };
  }

  /**
   * Extracts Cloudinary public_id from a secure URL.
   * e.g. https://res.cloudinary.com/cloud/image/upload/v123/folder/file.jpg → folder/file
   */
  private extractCloudinaryPublicId(url: string): string | null {
    try {
      const match = url.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\.[a-z]{2,4})?$/i);
      return match ? match[1] : null;
    } catch {
      return null;
    }
  }

  async getDashboardCounts() {
    const cached = await this.cache.get<ReturnType<typeof this._computeDashboardCounts>>(DASHBOARD_COUNTS_KEY);
    if (cached) return cached;
    const counts = await this._computeDashboardCounts();
    await this.cache.set(DASHBOARD_COUNTS_KEY, counts, DASHBOARD_COUNTS_TTL);
    return counts;
  }

  private async _computeDashboardCounts() {
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [
      communityImagesPending,
      dataRequestsPending,
      dataRequestsInProgress,
      saleRequestsPending,
      bugReportsOpen,
      featureRequestsPending,
      seriesSuggestionsPending,
      totalUsers,
      activeUsersLastWeek,
    ] = await this.prisma.$transaction([
      this.prisma.userEditionImage.count({ where: { status: 'PENDING' } }),
      this.prisma.dataRequest.count({ where: { status: 'pending' } }),
      this.prisma.dataRequest.count({ where: { status: 'in_progress' } }),
      this.prisma.saleAnnouncementRequest.count({ where: { status: 'pending' } }),
      this.prisma.bugReport.count({ where: { status: 'open' } }),
      this.prisma.featureRequest.count({ where: { status: 'pending' } }),
      this.prisma.seriesVolumeSuggestion.count({ where: { status: 'pending' } }),
      this.prisma.user.count(),
      this.prisma.user.count({ where: { lastLoginAt: { gte: oneWeekAgo } } }),
    ]);

    return {
      communityImagesPending,
      dataRequestsPending,
      dataRequestsInProgress,
      saleRequestsPending,
      bugReportsOpen,
      featureRequestsPending,
      seriesSuggestionsPending,
      totalUsers,
      activeUsersLastWeek,
    };
  }

  /** Backfill nextRenewalDate for all active subscription entries that don't have it set. */
  async backfillNextRenewalDates(): Promise<{ processed: number; skipped: number }> {
    const entries = await this.prisma.userSubscriptionEntry.findMany({
      where: { active: true },
      select: { id: true, nextRenewalDate: true },
    });

    const toProcess = entries.filter((e) => !e.nextRenewalDate);
    const skipped = entries.length - toProcess.length;

    // Process in batches of 50 to avoid saturating the DB connection pool
    const BATCH_SIZE = 50;
    for (let i = 0; i < toProcess.length; i += BATCH_SIZE) {
      const batch = toProcess.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map((e) => refreshNextRenewalDate(this.prisma, e.id)));
    }

    return { processed: toProcess.length, skipped };
  }

  // ── Company "Data Freshness" tracking ──────────────────────────────────────
  // Every company has exactly one company_data_checks row (seeded at epoch by the
  // migration and on company create). "Never checked" == checkedAt at epoch.

  private static readonly EPOCH = new Date(0);

  async listCompanyDataChecks() {
    const rows = await this.prisma.bookBoxCompany.findMany({
      select: {
        slug: true,
        name: true,
        dataCheck: { select: { checkedAt: true, checkedByName: true, note: true } },
      },
    });

    return rows
      .map((c) => ({
        slug: c.slug,
        name: c.name,
        checkedAt: (c.dataCheck?.checkedAt ?? AdminService.EPOCH).toISOString(),
        checkedByName: c.dataCheck?.checkedByName ?? null,
        note: c.dataCheck?.note ?? null,
      }))
      // Stalest first: epoch/never rows on top, then oldest checkedAt, then name.
      .sort((a, b) => +new Date(a.checkedAt) - +new Date(b.checkedAt) || a.name.localeCompare(b.name));
  }

  async updateCompanyDataCheck(
    slug: string,
    dto: { touch?: boolean; note?: string | null },
    actor: { id: string; username: string },
  ) {
    const company = await this.prisma.bookBoxCompany.findUnique({
      where: { slug },
      select: { id: true, slug: true, name: true },
    });
    if (!company) throw new NotFoundException('Company not found');

    const touchFields = dto.touch
      ? { checkedAt: new Date(), checkedByName: actor.username }
      : {};
    const noteField =
      dto.note !== undefined ? { note: dto.note === '' ? null : dto.note } : {};

    // Row normally exists; upsert keeps this correct if it somehow doesn't.
    const check = await this.prisma.companyDataCheck.upsert({
      where: { companyId: company.id },
      create: { companyId: company.id, checkedAt: AdminService.EPOCH, ...touchFields, ...noteField },
      update: { ...touchFields, ...noteField },
      select: { checkedAt: true, checkedByName: true, note: true },
    });

    if (dto.touch) {
      void this.auditService.log({
        userId: actor.id,
        username: actor.username,
        action: 'TOUCH_COMPANY_DATA_CHECK',
        entityType: 'company',
        entityId: company.id,
        entityTitle: company.slug,
      });
    }

    return {
      slug: company.slug,
      name: company.name,
      checkedAt: check.checkedAt.toISOString(),
      checkedByName: check.checkedByName,
      note: check.note,
    };
  }
}
