import { Controller, Get, Post, Delete, Param } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { FollowsService } from './follows.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('follows')
@ApiBearerAuth()
@Controller('follows')
export class FollowsController {
  constructor(private readonly service: FollowsService) {}

  /** Combined listing for the "My follows" settings page. */
  @Get()
  findAll(@CurrentUser() user: { id: string }) {
    return this.service.findAll(user.id);
  }

  @Get('artists/:artistId')
  artistStatus(@CurrentUser() user: { id: string }, @Param('artistId') artistId: string) {
    return this.service.artistStatus(user.id, artistId);
  }

  @Post('artists/:artistId')
  followArtist(@CurrentUser() user: { id: string }, @Param('artistId') artistId: string) {
    return this.service.followArtist(user.id, artistId);
  }

  @Delete('artists/:artistId')
  unfollowArtist(@CurrentUser() user: { id: string }, @Param('artistId') artistId: string) {
    return this.service.unfollowArtist(user.id, artistId);
  }

  @Get('authors/:authorId')
  authorStatus(@CurrentUser() user: { id: string }, @Param('authorId') authorId: string) {
    return this.service.authorStatus(user.id, authorId);
  }

  @Post('authors/:authorId')
  followAuthor(@CurrentUser() user: { id: string }, @Param('authorId') authorId: string) {
    return this.service.followAuthor(user.id, authorId);
  }

  @Delete('authors/:authorId')
  unfollowAuthor(@CurrentUser() user: { id: string }, @Param('authorId') authorId: string) {
    return this.service.unfollowAuthor(user.id, authorId);
  }

  @Get('books/:bookId')
  bookStatus(@CurrentUser() user: { id: string }, @Param('bookId') bookId: string) {
    return this.service.bookStatus(user.id, bookId);
  }

  @Post('books/:bookId')
  followBook(@CurrentUser() user: { id: string }, @Param('bookId') bookId: string) {
    return this.service.followBook(user.id, bookId);
  }

  @Delete('books/:bookId')
  unfollowBook(@CurrentUser() user: { id: string }, @Param('bookId') bookId: string) {
    return this.service.unfollowBook(user.id, bookId);
  }
}
