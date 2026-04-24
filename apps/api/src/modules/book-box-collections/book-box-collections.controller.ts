import { Controller, Get, Post, Patch, Delete, Param, Body, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { BookBoxCollectionsService } from './book-box-collections.service';
import {
  CreateBookBoxCollectionDto,
  UpdateBookBoxCollectionDto,
  BookBoxCollectionQueryDto,
} from './book-box-collections.dto';
import { Public, Roles } from '../../common/decorators/auth.decorators';

@ApiTags('book-box-collections')
@Controller('book-box-collections')
export class BookBoxCollectionsController {
  constructor(private readonly service: BookBoxCollectionsService) {}

  @Public()
  @Get()
  findAll(@Query() query: BookBoxCollectionQueryDto) {
    return this.service.findAll(query);
  }

  @Public()
  @Get(':slug')
  findBySlug(@Param('slug') slug: string) {
    return this.service.findBySlug(slug);
  }

  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR', 'COMPANY_MANAGER')
  @Post()
  create(@Body() dto: CreateBookBoxCollectionDto) {
    return this.service.create(dto);
  }

  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR', 'COMPANY_MANAGER')
  @Patch(':slug')
  update(@Param('slug') slug: string, @Body() dto: UpdateBookBoxCollectionDto) {
    return this.service.update(slug, dto);
  }

  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR')
  @Delete(':slug')
  delete(@Param('slug') slug: string) {
    return this.service.delete(slug);
  }
}
