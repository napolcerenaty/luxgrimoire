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
import { ArtistsService } from './artists.service';
import { CreateArtistDto, UpdateArtistDto, ArtistQueryDto } from './artists.dto';
import { Public, Roles } from '../../common/decorators/auth.decorators';

@ApiTags('artists')
@Controller('artists')
export class ArtistsController {
  constructor(private readonly artistsService: ArtistsService) {}

  @Public()
  @Get()
  findAll(@Query() query: ArtistQueryDto) {
    return this.artistsService.findAll(query);
  }

  @Public()
  @Get(':slug')
  findBySlug(@Param('slug') slug: string) {
    return this.artistsService.findBySlug(slug);
  }

  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR')
  @Post()
  create(@Body() dto: CreateArtistDto) {
    return this.artistsService.create(dto);
  }

  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR')
  @Patch(':slug')
  update(@Param('slug') slug: string, @Body() dto: UpdateArtistDto) {
    return this.artistsService.update(slug, dto);
  }

  @ApiBearerAuth()
  @Roles('ADMIN')
  @Delete(':slug')
  delete(@Param('slug') slug: string) {
    return this.artistsService.delete(slug);
  }
}
