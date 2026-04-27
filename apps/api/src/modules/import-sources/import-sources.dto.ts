import { IsString, IsOptional, IsBoolean, IsInt, IsIn, Min, Max, IsUrl } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const SOURCE_TYPES = ['BLOG', 'BLOG_LISTING', 'RSS'] as const;
export const TARGET_TYPES = ['MONTH_THEME', 'SALE_ANNOUNCEMENT'] as const;
export const CHECK_FREQUENCIES = ['DAILY', 'WEEKLY', 'MONTHLY'] as const;
export const PENDING_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const;

export class CreateImportSourceDto {
  @ApiProperty() @IsString() name!: string;
  @ApiProperty() @IsUrl() url!: string;
  @ApiPropertyOptional({ enum: SOURCE_TYPES }) @IsOptional() @IsIn(SOURCE_TYPES) sourceType?: string;
  @ApiPropertyOptional({ enum: TARGET_TYPES }) @IsOptional() @IsIn(TARGET_TYPES) targetType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() companyId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() subscriptionId?: string;
  @ApiPropertyOptional({ enum: CHECK_FREQUENCIES }) @IsOptional() @IsIn(CHECK_FREQUENCIES) checkFrequency?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(23) checkHour?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(6) checkDayOfWeek?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(28) checkDayOfMonth?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() monthThemeKeywords?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() saleKeywords?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() enabled?: boolean;
}

export class UpdateImportSourceDto extends CreateImportSourceDto {}

export class ScrapeUrlDto {
  @ApiProperty({ description: 'URL of the blog post or page to scrape' })
  @IsUrl()
  url!: string;

  @ApiPropertyOptional() @IsOptional() @IsString() subscriptionId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() companyId?: string;
}

export class ScrapeParentDto {
  @ApiProperty({ description: 'URL of the listing/archive page' })
  @IsUrl()
  url!: string;
}

export class ApprovePendingDto {
  @ApiPropertyOptional() @IsOptional() @IsString() adminNote?: string;
}

export class RejectPendingDto {
  @ApiPropertyOptional() @IsOptional() @IsString() adminNote?: string;
}
