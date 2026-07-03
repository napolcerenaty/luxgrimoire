import { Controller, Get, Post, Patch, Delete, Param, Body } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { HomepageFeaturesService } from './homepage-features.service';
import { CreateHomepageFeatureDto, UpdateHomepageFeatureDto } from './homepage-features.dto';
import { Public, Roles } from '../../common/decorators/auth.decorators';

@ApiTags('homepage-features')
@Controller('homepage-features')
export class HomepageFeaturesController {
  constructor(private readonly service: HomepageFeaturesService) {}

  @Public()
  @Get()
  findActive() {
    return this.service.findActive();
  }

  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR')
  @Get('admin')
  findAll() {
    return this.service.findAll();
  }

  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR')
  @Post()
  create(@Body() dto: CreateHomepageFeatureDto) {
    return this.service.create(dto);
  }

  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateHomepageFeatureDto) {
    return this.service.update(id, dto);
  }

  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
