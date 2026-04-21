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
import { EditionsService } from './editions.service';
import {
  CreateEditionDto,
  UpdateEditionDto,
  AddArtistDto,
  EditionQueryDto,
} from './editions.dto';
import { Public, Roles } from '../../common/decorators/auth.decorators';

@ApiTags('editions')
@Controller('editions')
export class EditionsController {
  constructor(private readonly editionsService: EditionsService) {}

  @Public()
  @Get()
  findAll(@Query() query: EditionQueryDto) {
    return this.editionsService.findAll(query);
  }

  @Public()
  @Get(':slug')
  findBySlug(@Param('slug') slug: string) {
    return this.editionsService.findBySlug(slug);
  }

  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR')
  @Post()
  create(@Body() dto: CreateEditionDto) {
    return this.editionsService.create(dto);
  }

  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR')
  @Patch(':slug')
  update(@Param('slug') slug: string, @Body() dto: UpdateEditionDto) {
    return this.editionsService.update(slug, dto);
  }

  @ApiBearerAuth()
  @Roles('ADMIN')
  @Delete(':slug')
  delete(@Param('slug') slug: string) {
    return this.editionsService.delete(slug);
  }

  @ApiBearerAuth()
  @Roles('ADMIN', 'MODERATOR')
  @Post(':slug/artists')
  addArtist(@Param('slug') slug: string, @Body() dto: AddArtistDto) {
    return this.editionsService.addArtist(slug, dto);
  }

  @ApiBearerAuth()
  @Roles('ADMIN')
  @Delete(':slug/artists/:artistId')
  removeArtist(@Param('slug') slug: string, @Param('artistId') artistId: string) {
    return this.editionsService.removeArtist(slug, artistId);
  }
}
