import { Controller, Get, Post, Patch, Delete, Param, Body, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Public, Roles } from '../../common/decorators/auth.decorators';
import { FeatureCategoriesService } from './feature-categories.service';
import { FeatureTaggerService } from './feature-tagger.service';
import { CreateFeatureCategoryDto, UpdateFeatureCategoryDto } from './feature-categories.dto';

@ApiTags('feature-categories')
@ApiBearerAuth()
@Controller('feature-categories')
export class FeatureCategoriesController {
  constructor(
    private readonly service: FeatureCategoriesService,
    private readonly tagger: FeatureTaggerService,
  ) {}

  @Public()
  @Get()
  findAll(@Query('includeInactive') includeInactive?: string) {
    return this.service.findAll(includeInactive === 'true');
  }

  @Roles('ADMIN', 'MODERATOR')
  @Post()
  create(@Body() dto: CreateFeatureCategoryDto) {
    return this.service.create(dto);
  }

  @Roles('ADMIN', 'MODERATOR')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateFeatureCategoryDto) {
    return this.service.update(id, dto);
  }

  @Roles('ADMIN', 'MODERATOR')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  /** Preview-only categorization — does NOT save to DB. */
  @Roles('ADMIN', 'MODERATOR')
  @Post('tag-preview')
  tagPreview(@Body() body: { features: string[] }) {
    const features: string[] = Array.isArray(body?.features) ? body.features : [];
    return this.tagger.categorizeMany(features).then(map =>
      features
        .filter(f => f.trim())
        .map(f => ({ rawValue: f, categories: map[f] ?? [] }))
    );
  }
}
