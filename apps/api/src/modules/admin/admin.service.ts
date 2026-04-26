import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogQueryDto, RecentEditionsQueryDto, AssignRoleDto, UserQueryDto } from './admin.dto';
import { Role } from '@prisma/client';
import { UploadService } from '../upload/upload.service';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploadService: UploadService,
  ) {}

  async getAuditLogs(query: AuditLogQueryDto) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 30, 100);
    const skip = (page - 1) * pageSize;
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

    return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async getStats() {
    const [
      totalBooks,
      totalEditions,
      totalAuthors,
      totalArtists,
      totalCompanies,
      totalSubscriptions,
      totalUsers,
      totalAuditLogs,
      actionsLast7Days,
    ] = await Promise.all([
      this.prisma.book.count(),
      this.prisma.bookEdition.count(),
      this.prisma.author.count(),
      this.prisma.artist.count(),
      this.prisma.bookBoxCompany.count(),
      this.prisma.subscription.count(),
      this.prisma.user.count(),
      this.prisma.auditLog.count(),
      this.prisma.auditLog.count({
        where: { createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
      }),
    ]);

    return {
      totalBooks,
      totalEditions,
      totalAuthors,
      totalArtists,
      totalCompanies,
      totalSubscriptions,
      totalUsers,
      totalAuditLogs,
      actionsLast7Days,
    };
  }

  async getRecentEditions(query: RecentEditionsQueryDto) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 30, 100);
    const skip = (page - 1) * pageSize;
    const sortBy = query.sortBy ?? 'updatedAt';
    const order = (query.order ?? 'desc') as 'asc' | 'desc';

    const where: Record<string, unknown> = {};

    if (query.search) {
      where.OR = [
        { slug: { contains: query.search, mode: 'insensitive' } },
        { editionName: { contains: query.search, mode: 'insensitive' } },
        { publisher: { contains: query.search, mode: 'insensitive' } },
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
        include: {
          book: {
            select: {
              id: true,
              slug: true,
              title: true,
              coverImage: true,
              authors: { include: { author: { select: { id: true, name: true } } } },
            },
          },
          bookBoxCompany: { select: { id: true, name: true, slug: true } },
        },
      }),
      this.prisma.bookEdition.count({ where }),
    ]);

    // Enrich with last audit log action per edition
    const editionIds = data.map((e) => e.id);
    const lastAuditLogs = editionIds.length
      ? await this.prisma.auditLog.findMany({
          where: { entityId: { in: editionIds }, entityType: 'edition' },
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

    return { data: enriched, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async assignRole(userId: string, dto: AssignRoleDto) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        role: dto.role as Role,
        managedCompanyId: dto.role === 'COMPANY_MANAGER' ? (dto.managedCompanyId ?? null) : null,
      },
      select: { id: true, username: true, email: true, role: true, managedCompanyId: true },
    });
  }

  async getUsers(query: UserQueryDto) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 20, 100);
    const skip = (page - 1) * pageSize;
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
          managedCompany: { select: { name: true, slug: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);
    return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async deleteUser(userId: string) {
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
