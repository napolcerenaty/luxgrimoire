import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateImagePermissionDto, CreateCommunicationDto, UpdateCommunicationDto } from './image-permissions.dto';

@Injectable()
export class ImagePermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  /** One row per company, whether or not a CompanyImagePermission record exists yet (defaults to PENDING). */
  async findAll() {
    const companies = await this.prisma.bookBoxCompany.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        hasOfficialImagePermission: true,
        imagePermission: true,
      },
      orderBy: { name: 'asc' },
    });

    return companies
      .map((c) => ({
        companyId: c.id,
        companyName: c.name,
        companySlug: c.slug,
        hasOfficialImagePermission: c.hasOfficialImagePermission,
        status: c.imagePermission?.status ?? 'PENDING',
        grantedByName: c.imagePermission?.grantedByName ?? null,
        grantedAt: c.imagePermission?.grantedAt ?? null,
        conditions: c.imagePermission?.conditions ?? [],
        emailContent: c.imagePermission?.emailContent ?? null,
        updatedAt: c.imagePermission?.updatedAt ?? null,
      }))
      .sort((a, b) => a.companyName.localeCompare(b.companyName, undefined, { sensitivity: 'base' }));
  }

  /** Upserts the permission record and keeps BookBoxCompany.hasOfficialImagePermission in sync as a cache — in both directions. */
  async upsertPermission(companyId: string, dto: UpdateImagePermissionDto) {
    const company = await this.prisma.bookBoxCompany.findUnique({ where: { id: companyId }, select: { id: true } });
    if (!company) throw new NotFoundException('Company not found');

    const isGranted = dto.status === 'GRANTED';

    const [permission] = await this.prisma.$transaction([
      this.prisma.companyImagePermission.upsert({
        where: { companyId },
        create: {
          companyId,
          status: dto.status,
          grantedByName: dto.grantedByName ?? null,
          grantedAt: dto.grantedAt ? new Date(dto.grantedAt) : null,
          conditions: dto.conditions ?? [],
          emailContent: dto.emailContent ?? null,
        },
        update: {
          status: dto.status,
          ...(dto.grantedByName !== undefined && { grantedByName: dto.grantedByName }),
          ...(dto.grantedAt !== undefined && { grantedAt: dto.grantedAt ? new Date(dto.grantedAt) : null }),
          ...(dto.conditions !== undefined && { conditions: dto.conditions }),
          ...(dto.emailContent !== undefined && { emailContent: dto.emailContent }),
        },
      }),
      this.prisma.bookBoxCompany.update({
        where: { id: companyId },
        data: { hasOfficialImagePermission: isGranted },
      }),
    ]);

    return permission;
  }

  async listCommunications(companyId: string) {
    return this.prisma.companyPermissionCommunication.findMany({
      where: { companyId },
      orderBy: { sentAt: 'desc' },
    });
  }

  async createCommunication(companyId: string, dto: CreateCommunicationDto) {
    const company = await this.prisma.bookBoxCompany.findUnique({ where: { id: companyId }, select: { id: true } });
    if (!company) throw new NotFoundException('Company not found');

    return this.prisma.companyPermissionCommunication.create({
      data: {
        companyId,
        sentAt: new Date(dto.sentAt),
        channel: dto.channel,
        subject: dto.subject,
        responded: dto.responded ?? false,
      },
    });
  }

  async updateCommunication(id: string, dto: UpdateCommunicationDto) {
    const existing = await this.prisma.companyPermissionCommunication.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Communication log entry not found');

    return this.prisma.companyPermissionCommunication.update({
      where: { id },
      data: { responded: dto.responded },
    });
  }
}
