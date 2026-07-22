import { IsString, IsOptional, IsEnum, IsUrl, IsObject, MaxLength } from 'class-validator';
import { NewsItemType } from '@prisma/client';

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
