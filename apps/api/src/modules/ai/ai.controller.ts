import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';
import { Throttle } from '@nestjs/throttler';
import { Roles } from '../../common/decorators/auth.decorators';
import { AiService } from './ai.service';

class AiParseDto {
  @IsOptional()
  @IsString()
  text?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;
}

@ApiTags('ai')
@ApiBearerAuth()
@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Roles('ADMIN', 'MODERATOR', 'COMPANY_MANAGER')
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @Post('parse')
  parse(@Body() dto: AiParseDto) {
    return this.aiService.parse(dto);
  }
}
