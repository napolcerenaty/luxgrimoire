import { Controller, Get, Post, Delete, Param, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Public } from '../../common/decorators/auth.decorators';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SocialService } from './social.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';

@ApiTags('social')
@ApiBearerAuth()
@Controller()
export class SocialController {
  constructor(
    private readonly socialService: SocialService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('social/follow/:username')
  async followUser(
    @CurrentUser() user: { id: string },
    @Param('username') username: string,
  ) {
    const target = await this.prisma.user.findUnique({ where: { username }, select: { id: true } });
    if (!target) throw new NotFoundException('User not found');
    return this.socialService.followUser(user.id, target.id);
  }

  @Delete('social/follow/:username')
  async unfollowUser(
    @CurrentUser() user: { id: string },
    @Param('username') username: string,
  ) {
    const target = await this.prisma.user.findUnique({ where: { username }, select: { id: true } });
    if (!target) throw new NotFoundException('User not found');
    return this.socialService.unfollowUser(user.id, target.id);
  }

  @Get('social/followers')
  getOwnFollowers(
    @CurrentUser() user: { id: string },
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.socialService.getFollowers(
      user.id,
      page ? Number(page) : 1,
      pageSize ? Number(pageSize) : 20,
    );
  }

  @Get('social/following')
  getOwnFollowing(
    @CurrentUser() user: { id: string },
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.socialService.getFollowing(
      user.id,
      page ? Number(page) : 1,
      pageSize ? Number(pageSize) : 20,
    );
  }

  @Get('social/feed')
  getActivityFeed(
    @CurrentUser() user: { id: string },
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.socialService.getActivityFeed(
      user.id,
      page ? Number(page) : 1,
      pageSize ? Number(pageSize) : 20,
    );
  }

  @Public()
  @Get('users/:username/followers')
  async getUserFollowers(
    @Param('username') username: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const user = await this.prisma.user.findUnique({ where: { username }, select: { id: true } });
    if (!user) throw new NotFoundException('User not found');
    return this.socialService.getFollowers(
      user.id,
      page ? Number(page) : 1,
      pageSize ? Number(pageSize) : 20,
    );
  }

  @Public()
  @Get('users/:username/following')
  async getUserFollowing(
    @Param('username') username: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const user = await this.prisma.user.findUnique({ where: { username }, select: { id: true } });
    if (!user) throw new NotFoundException('User not found');
    return this.socialService.getFollowing(
      user.id,
      page ? Number(page) : 1,
      pageSize ? Number(pageSize) : 20,
    );
  }
}
