import { IsString, IsOptional, IsBoolean, IsNumber, IsArray, IsIn } from 'class-validator';

const SALE_STATUSES = ['announcement', 'available', 'sold_out'];

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
  isPublished?: boolean;

  @IsOptional()
  @IsBoolean()
  isBundle?: boolean;

  @IsOptional()
  @IsIn(SALE_STATUSES)
  saleStatus?: string;

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
  isPublished?: boolean;

  @IsOptional()
  @IsBoolean()
  isBundle?: boolean;

  @IsOptional()
  @IsIn(SALE_STATUSES)
  saleStatus?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  extraImages?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  editionIds?: string[];
}
