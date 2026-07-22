import { IsString, IsOptional, IsEnum, IsUrl, IsObject, MaxLength } from 'class-validator';
import { NewsItemType } from '@prisma/client';

export class IngestScreenshotDto {
  @IsString()
  @MaxLength(10_000_000) // ~7.5 MB base64
  imageBase64!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  caption?: string;
}

export class IngestEmailDto {
  @IsString()
  @MaxLength(998) // RFC 5322 max header line length
  subject!: string;

  @IsString()
  @MaxLength(500_000)
  html!: string;

  @IsOptional()
  @IsString()
  @MaxLength(998)
  messageId?: string;
}

export class CreateNewsDraftDto {
  @IsString()
  @MaxLength(200)
  companyName!: string;

  @IsString()
  @MaxLength(300)
  title!: string;

  @IsOptional()
  @IsEnum(NewsItemType)
  type?: NewsItemType;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  summary?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  appEntityLink?: string;

  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2048)
  originalSourceUrl?: string;

  @IsOptional()
  @IsObject()
  linkedDraftPayload?: Record<string, unknown>;
}

export class UpdateNewsDraftDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  companyName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  title?: string;

  @IsOptional()
  @IsEnum(NewsItemType)
  type?: NewsItemType;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  summary?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  appEntityLink?: string;

  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2048)
  originalSourceUrl?: string;

  @IsOptional()
  @IsObject()
  linkedDraftPayload?: Record<string, unknown>;
}
