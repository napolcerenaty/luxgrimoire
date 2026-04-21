import { Controller, Get, Patch, Param, Body } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Public } from '../../common/decorators/auth.decorators';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ProfileService } from './profile.service';
import { UpdateProfileDto, ChangeUsernameDto } from './profile.dto';

@ApiTags('profile')
@Controller('profile')
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

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
}
