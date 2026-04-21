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
import { Public } from '../../common/decorators/auth.decorators';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto, UpdateReviewDto } from './reviews.dto';

@ApiTags('reviews')
@Controller()
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Public()
  @Get('books/:bookId/reviews')
  getBookReviews(
    @Param('bookId') bookId: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.reviewsService.getBookReviews(
      bookId,
      page ? Number(page) : 1,
      pageSize ? Number(pageSize) : 20,
    );
  }

  @Public()
  @Get('books/:bookId/reviews/summary')
  getBookRatingSummary(@Param('bookId') bookId: string) {
    return this.reviewsService.getBookRatingSummary(bookId);
  }

  @ApiBearerAuth()
  @Post('books/:bookId/reviews')
  createReview(
    @CurrentUser() user: { id: string },
    @Param('bookId') bookId: string,
    @Body() dto: CreateReviewDto,
  ) {
    return this.reviewsService.createReview(user.id, { ...dto, bookId });
  }

  @ApiBearerAuth()
  @Patch('reviews/:id')
  updateReview(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: UpdateReviewDto,
  ) {
    return this.reviewsService.updateReview(user.id, id, dto);
  }

  @ApiBearerAuth()
  @Delete('reviews/:id')
  deleteReview(
    @CurrentUser() user: { id: string; role?: string },
    @Param('id') id: string,
  ) {
    return this.reviewsService.deleteReview(user.id, id, user.role);
  }

  @ApiBearerAuth()
  @Post('reviews/:id/helpful')
  markHelpful(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.reviewsService.markHelpful(user.id, id);
  }

  @Public()
  @Get('users/:username/reviews')
  getUserReviewsByUsername(
    @Param('username') username: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.reviewsService.getUserReviewsByUsername(
      username,
      page ? Number(page) : 1,
      pageSize ? Number(pageSize) : 20,
    );
  }
}
