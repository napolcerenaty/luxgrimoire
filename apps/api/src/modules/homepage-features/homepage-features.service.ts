import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateHomepageFeatureDto, UpdateHomepageFeatureDto } from './homepage-features.dto';

@Injectable()
export class HomepageFeaturesService {
  constructor(private readonly prisma: PrismaService) {}

  findActive() {
    return this.prisma.homepageFeature.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  findAll() {
    return this.prisma.homepageFeature.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  create(dto: CreateHomepageFeatureDto) {
    return this.prisma.homepageFeature.create({ data: dto });
  }

  update(id: string, dto: UpdateHomepageFeatureDto) {
    return this.prisma.homepageFeature.update({
      where: { id },
      data: { ...dto, updatedAt: new Date() },
    });
  }

  remove(id: string) {
    return this.prisma.homepageFeature.delete({ where: { id } });
  }
}
