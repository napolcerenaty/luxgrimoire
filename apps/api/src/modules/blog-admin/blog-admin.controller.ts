import { Body, Controller, Delete, Get, Param, Put } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/auth.decorators';
import { BlogAdminService } from './blog-admin.service';
import { SetFeatureImageDto } from './blog-admin.dto';

@ApiTags('admin')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/blog-posts')
export class BlogAdminController {
  constructor(private readonly blogAdminService: BlogAdminService) {}

  @Get()
  list() {
    return this.blogAdminService.listPosts();
  }

  @Put(':slug/feature-image')
  setFeatureImage(@Param('slug') slug: string, @Body() dto: SetFeatureImageDto) {
    return this.blogAdminService.setFeatureImage(slug, dto.imageUrl);
  }

  @Delete(':slug/feature-image')
  clearFeatureImage(@Param('slug') slug: string) {
    return this.blogAdminService.clearFeatureImage(slug);
  }
}
