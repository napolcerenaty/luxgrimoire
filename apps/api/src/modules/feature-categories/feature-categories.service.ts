import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FeatureTaggerService } from './feature-tagger.service';
import { CreateFeatureCategoryDto, UpdateFeatureCategoryDto } from './feature-categories.dto';

@Injectable()
export class FeatureCategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tagger: FeatureTaggerService,
  ) {}

  async findAll(includeInactive = false) {
    return this.prisma.featureCategory.findMany({
      where: includeInactive ? undefined : { isActive: true },
      orderBy: [{ group: 'asc' }, { sortOrder: 'asc' }, { label: 'asc' }],
    });
  }

  async findOne(id: string) {
    const category = await this.prisma.featureCategory.findUnique({ where: { id } });
    if (!category) throw new NotFoundException(`FeatureCategory ${id} not found`);
    return category;
  }

  async create(dto: CreateFeatureCategoryDto) {
    const existing = await this.prisma.featureCategory.findUnique({ where: { slug: dto.slug } });
    if (existing) throw new ConflictException(`Slug "${dto.slug}" already exists`);

    const result = await this.prisma.featureCategory.create({
      data: {
        slug: dto.slug,
        label: dto.label,
        group: dto.group,
        isActive: dto.isActive ?? true,
        sortOrder: dto.sortOrder ?? 0,
        includePatterns: dto.includePatterns ?? [],
        excludePatterns: dto.excludePatterns ?? [],
      },
    });
    this.tagger.invalidateCache();
    return result;
  }

  async update(id: string, dto: UpdateFeatureCategoryDto) {
    await this.findOne(id);

    if (dto.slug) {
      const conflict = await this.prisma.featureCategory.findUnique({ where: { slug: dto.slug } });
      if (conflict && conflict.id !== id) {
        throw new ConflictException(`Slug "${dto.slug}" already in use`);
      }
    }

    const result = await this.prisma.featureCategory.update({
      where: { id },
      data: {
        ...(dto.slug !== undefined && { slug: dto.slug }),
        ...(dto.label !== undefined && { label: dto.label }),
        ...(dto.group !== undefined && { group: dto.group }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
        ...(dto.includePatterns !== undefined && { includePatterns: dto.includePatterns }),
        ...(dto.excludePatterns !== undefined && { excludePatterns: dto.excludePatterns }),
      },
    });
    this.tagger.invalidateCache();
    return result;
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.featureCategory.delete({ where: { id } });
    this.tagger.invalidateCache();
    return { success: true };
  }
}
