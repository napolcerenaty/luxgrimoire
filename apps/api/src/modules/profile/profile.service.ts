import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateProfileDto, ChangeUsernameDto } from './profile.dto';

@Injectable()
export class ProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(username: string) {
    const user = await this.prisma.user.findUnique({
      where: { username },
      select: {
        id: true,
        username: true,
        bio: true,
        avatarUrl: true,
        createdAt: true,
        role: true,
        _count: {
          select: {
            bookEntries: true,
          },
        },
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.bio !== undefined && { bio: dto.bio }),
        ...(dto.displayName !== undefined && { displayName: dto.displayName }),
        ...(dto.avatar !== undefined && { avatarUrl: dto.avatar }),
        ...(dto.preferredCurrency !== undefined && { preferredCurrency: dto.preferredCurrency }),
        ...(dto.timezone !== undefined && { timezone: dto.timezone }),
        ...(dto.timeFormat !== undefined && { timeFormat: dto.timeFormat }),
        ...(dto.defaultTaxRate !== undefined && { defaultTaxRate: dto.defaultTaxRate }),
        ...(dto.shippingCountry !== undefined && { shippingCountry: dto.shippingCountry.toUpperCase() }),
      },
      select: {
        id: true,
        username: true,
        email: true,
        displayName: true,
        bio: true,
        avatarUrl: true,
        preferredCurrency: true,
        timezone: true,
        timeFormat: true,
        defaultTaxRate: true,
        shippingCountry: true,
        statsSettings: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async deleteAccount(userId: string) {
    await this.prisma.user.delete({ where: { id: userId } });
  }

  async changeUsername(userId: string, dto: ChangeUsernameDto) {
    const existing = await this.prisma.user.findUnique({ where: { username: dto.username } });
    if (existing && existing.id !== userId) throw new ConflictException('Username already taken');
    return this.prisma.user.update({
      where: { id: userId },
      data: { username: dto.username },
      select: { id: true, username: true, email: true, updatedAt: true },
    });
  }
}
