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

  @IsOptional()
  @IsString()
  @MaxLength(10_000_000) // ~7.5 MB base64
  imageBase64?: string;

  /** Crediting company name — used to attribute in-house/internal team credits
   *  as "<Company> in-house team" instead of a generic fallback. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  companyName?: string;
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

  @IsOptional()
  @IsString()
  @MaxLength(10_000_000)
  imageBase64?: string;
}

class AiParseBookDto {
  @IsOptional()
  @IsString()
  @MaxLength(8_000)
  text?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10_000_000)
  imageBase64?: string;
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
    if (!dto.text && !dto.imageUrl && !dto.imageBase64) {
      throw new BadRequestException('Provide either text, imageUrl, or imageBase64');
    }
    return this.aiService.parse(dto);
  }

  @Roles('ADMIN', 'MODERATOR', 'COMPANY_MANAGER')
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('parse-sale')
  parseSale(@Body() dto: AiParseSaleDto) {
    if (!dto.text && !dto.url && !dto.imageBase64) {
      throw new BadRequestException('Provide either text, url, or imageBase64');
    }
    if (dto.url) {
      return this.aiService.parseSaleAnnouncementFromUrl(dto.url);
    }
    if (dto.imageBase64) {
      return this.aiService.parseSaleAnnouncementFromImage(dto.imageBase64);
    }
    return this.aiService.parseSaleAnnouncement(dto.text!);
  }

  @Roles('ADMIN', 'MODERATOR')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('parse-book')
  parseBook(@Body() dto: AiParseBookDto) {
    if (!dto.text && !dto.imageBase64) {
      throw new BadRequestException('Provide either text or imageBase64');
    }
    if (dto.imageBase64) {
      return this.aiService.parseBookFromImage(dto.imageBase64);
    }
    return this.aiService.parseBookFromText(dto.text!);
  }
}
