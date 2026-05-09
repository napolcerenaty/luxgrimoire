import { Controller, Get, Patch, Delete, Param, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Public } from '../../common/decorators/auth.decorators';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ProfileService } from './profile.service';
import { UpdateProfileDto, ChangeUsernameDto } from './profile.dto';
import { AnalyticsService } from '../analytics/analytics.service';
import { UserEditionImagesService } from '../editions/user-edition-images.service';

@ApiTags('profile')
@Controller('profile')
export class ProfileController {
  constructor(
    private readonly profileService: ProfileService,
    private readonly analyticsService: AnalyticsService,
    private readonly userImagesService: UserEditionImagesService,
  ) {}

  @Public()
  @Get(':username')
  getProfile(@Param('username') username: string) {
    return this.profileService.getProfile(username);
  }

  @ApiBearerAuth()
  @Patch('username')
  changeUsername(@CurrentUser() user: { id: string }, @Body() dto: ChangeUsernameDto) {
    return this.profileService.changeUsername(user.id, dto);
  }

  @ApiBearerAuth()
  @Patch()
  updateProfile(@CurrentUser() user: { id: string }, @Body() dto: UpdateProfileDto) {
    return this.profileService.updateProfile(user.id, dto);
  }

  @ApiBearerAuth()
  @Get('community-images')
  getMyCommunityImages(@CurrentUser() user: { id: string }) {
    return this.userImagesService.getMyImages(user.id);
  }

  @ApiBearerAuth()
  @Delete('community-images/:imageId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteMyImage(@Param('imageId') imageId: string, @CurrentUser() user: { id: string }) {
    await this.userImagesService.deleteMyImageById(imageId, user.id);
  }

  @ApiBearerAuth()
  @Delete('account')
  async deleteAccount(@CurrentUser() user: { id: string }) {
    // Track before deletion so the userId exists in the DB
    this.analyticsService.track({
      eventType: 'account_delete',
      userId: user.id,
    });
    await this.profileService.deleteAccount(user.id);
    return { ok: true };
  }
}
