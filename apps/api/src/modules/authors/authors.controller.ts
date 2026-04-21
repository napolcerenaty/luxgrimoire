import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuthorsService } from './authors.service';
import { CreateAuthorDto, UpdateAuthorDto, AuthorQueryDto } from './authors.dto';
import { Public, Roles } from '../../common/decorators/auth.decorators';

@ApiTags('authors')
@Controller('authors')
export class AuthorsController {
  constructor(private readonly authorsService: AuthorsService) {}

  @Public()
  @Get()
  findAll(@Query() query: AuthorQueryDto) {
    return this.authorsService.findAll(query);
  }

  @Public()
  @Get(':slug')
  findBySlug(@Param('slug') slug: string) {
    return this.authorsService.findBySlug(slug);
  }

  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR')
  @Post()
  create(@Body() dto: CreateAuthorDto) {
    return this.authorsService.create(dto);
  }

  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR')
  @Patch(':slug')
  update(@Param('slug') slug: string, @Body() dto: UpdateAuthorDto) {
    return this.authorsService.update(slug, dto);
  }

  @ApiBearerAuth()
  @Roles('ADMIN')
  @Delete(':slug')
  delete(@Param('slug') slug: string) {
    return this.authorsService.delete(slug);
  }
}
