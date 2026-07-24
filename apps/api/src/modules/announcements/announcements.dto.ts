import { IsString, IsOptional, IsBoolean, IsNumber, IsArray, IsEnum, IsInt } from 'class-validator';
import { BaseNumericPriceCurrencyDto } from '../../common/dto/price.dto';

export type SaleType = 'LIMITED_PREORDER' | 'OPEN_PREORDER' | 'OVERSTOCK' | 'SALE';
const SALE_TYPES: SaleType[] = ['LIMITED_PREORDER', 'OPEN_PREORDER', 'OVERSTOCK', 'SALE'];

export class CreateSaleAnnouncementDto extends BaseNumericPriceCurrencyDto {
  @IsString()
  title: string = '';

  @IsOptional()
  @IsString()
  companyId?: string;

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
  endsAt?: string;

  @IsOptional()
  @IsEnum(SALE_TYPES)
  saleType?: SaleType;

  @IsOptional()
  @IsBoolean()
  isSoldOut?: boolean;

  @IsOptional()
  @IsString()
  notes?: string | null;

  @IsOptional()
  @IsString()
  saleTimezone?: string;

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
  @IsString()
  photoCredit?: string;

  @IsOptional()
  @IsString()
  sourceUrl?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  extraImages?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  editionIds?: string[];

  @IsOptional()
  @IsNumber()
  subscriberBasePrice?: number;
}

export class UpdateSaleAnnouncementDto extends BaseNumericPriceCurrencyDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  companyId?: string;

  @IsOptional()
  @IsString()
  generalSaleDate?: string | null;

  @IsOptional()
  @IsString()
  firstAccessDate?: string | null;

  @IsOptional()
  @IsString()
  earlyAccessDate?: string | null;

  @IsOptional()
  @IsString()
  endsAt?: string | null;

  @IsOptional()
  @IsEnum(SALE_TYPES)
  saleType?: SaleType;

  @IsOptional()
  @IsBoolean()
  isSoldOut?: boolean;

  @IsOptional()
  @IsString()
  notes?: string | null;

  @IsOptional()
  @IsString()
  saleTimezone?: string;

  @IsOptional()
  imageUrl?: string | null;

  @IsOptional()
  @IsBoolean()
  isBundle?: boolean;

  @IsOptional()
  @IsString()
  expectedShipping?: string;

  @IsOptional()
  @IsString()
  photoCredit?: string;

  @IsOptional()
  @IsString()
  sourceUrl?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  extraImages?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  editionIds?: string[];

  @IsOptional()
  @IsNumber()
  subscriberBasePrice?: number | null;
}

export class UpsertSaleAnnouncementItemDto {
  @IsOptional()
  @IsString()
  name?: string | null;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class AssignEditionToItemDto {
  @IsOptional()
  @IsString()
  itemId?: string | null;
}

/** One named access tier (e.g. "First Access", "VIP Access", "Flash Sale") for a sale
 *  announcement or one of its regions — replaces the old fixed firstAccessDate/
 *  earlyAccessDate/generalSaleDate slots with an arbitrary-length ordered list. */
export class UpsertSaleTierDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  name: string = '';

  @IsString()
  date: string = '';

  @IsOptional()
  @IsInt()
  order?: number;
}