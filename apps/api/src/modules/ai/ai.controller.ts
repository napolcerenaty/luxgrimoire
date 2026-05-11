import { Controller, Post, Body, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { IsString, IsOptional, IsUrl, MaxLength } from 'class-validator';
import { Throttle } from '@nestjs/throttler';
import { Roles } from '../../common/decorators/auth.decorators';
import { AiService } from './ai.service';

class AiParseDto {
  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  text?: string;

  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2048)
  imageUrl?: string;
}

class AiParseSaleDto {
  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  text?: string;

  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2048)
  url?: string;
}

@ApiTags('ai')
@ApiBearerAuth()
@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Roles('ADMIN', 'MODERATOR', 'COMPANY_MANAGER', 'USER')
  // Each call hits OpenAI Vision (paid). Keep aggressive limit to avoid cost abuse.
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('parse')
  parse(@Body() dto: AiParseDto) {
    if (!dto.text && !dto.imageUrl) {
      throw new BadRequestException('Provide either text or imageUrl');
    }
    return this.aiService.parse(dto);
  }

  @Roles('ADMIN', 'MODERATOR', 'COMPANY_MANAGER')
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('parse-sale')
  parseSale(@Body() dto: AiParseSaleDto) {
    if (!dto.text && !dto.url) {
      throw new BadRequestException('Provide either text or url');
    }
    if (dto.url) {
      return this.aiService.parseSaleAnnouncementFromUrl(dto.url);
    }
    return this.aiService.parseSaleAnnouncement(dto.text!);
  }
}
