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
import { BooksService } from './books.service';
import { CreateBookDto, UpdateBookDto, BookQueryDto } from './books.dto';
import { Public, Roles } from '../../common/decorators/auth.decorators';

@ApiTags('books')
@Controller('books')
export class BooksController {
  constructor(private readonly booksService: BooksService) {}

  @Public()
  @Get()
  findAll(@Query() query: BookQueryDto) {
    return this.booksService.findAll(query);
  }

  @Public()
  @Get(':slug')
  findBySlug(@Param('slug') slug: string) {
    return this.booksService.findBySlug(slug);
  }

  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR')
  @Post()
  create(@Body() dto: CreateBookDto) {
    return this.booksService.create(dto);
  }

  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR')
  @Patch(':slug')
  update(@Param('slug') slug: string, @Body() dto: UpdateBookDto) {
    return this.booksService.update(slug, dto);
  }

  @ApiBearerAuth()
  @Roles('ADMIN')
  @Delete(':slug')
  delete(@Param('slug') slug: string) {
    return this.booksService.delete(slug);
  }

  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR')
  @Post(':slug/authors/:authorId')
  addAuthor(@Param('slug') slug: string, @Param('authorId') authorId: string) {
    return this.booksService.addAuthor(slug, authorId);
  }

  @ApiBearerAuth()
  @Roles('ADMIN')
  @Delete(':slug/authors/:authorId')
  removeAuthor(@Param('slug') slug: string, @Param('authorId') authorId: string) {
    return this.booksService.removeAuthor(slug, authorId);
  }
}
