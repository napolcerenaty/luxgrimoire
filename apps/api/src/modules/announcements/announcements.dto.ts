import { IsString, IsOptional, IsBoolean, IsNumber, IsArray } from 'class-validator';

export class CreateSaleAnnouncementDto {
  @IsString()
  title: string = '';

  @IsOptional()
  @IsString()
  companyId?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  generalSaleDate?: string;

  @IsOptional()
  @IsString()
  firstAccessDate?: string;

  @IsOptional()
  @IsString()
  earlyAccessDate?: string;

  @IsOptional()
  @IsString()
  saleTimezone?: string;

  @IsOptional()
  @IsNumber()
  basePrice?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsBoolean()
  isBundle?: boolean;

  @IsOptional()
  @IsString()
  expectedShipping?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  extraImages?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  editionIds?: string[];
}

export class UpdateSaleAnnouncementDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  companyId?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  generalSaleDate?: string;

  @IsOptional()
  @IsString()
  firstAccessDate?: string;

  @IsOptional()
  @IsString()
  earlyAccessDate?: string;

  @IsOptional()
  @IsString()
  saleTimezone?: string;

  @IsOptional()
  @IsNumber()
  basePrice?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsBoolean()
  isBundle?: boolean;

  @IsOptional()
  @IsString()
  expectedShipping?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  extraImages?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  editionIds?: string[];
}
