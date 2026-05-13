import {
  IsString,
  IsOptional,
  IsInt,
  IsBoolean,
  IsArray,
  IsDecimal,
  IsNumber,
  Min,
  Max,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { BasePriceCurrencyDto } from '../../common/dto/price.dto';

export class CreateEditionDto extends BasePriceCurrencyDto {
  @IsString()
  bookId!: string;

  @IsOptional()
  @IsString()
  publisher?: string;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  additionalImages?: string[];

  @IsOptional()
  @IsBoolean()
  isSpecial?: boolean;

  @IsOptional()
  @IsString()
  firstAccessDate?: string;

  @IsOptional()
  @IsString()
  earlyAccessDate?: string;

  @IsOptional()
  @IsString()
  generalSaleDate?: string;

  @IsOptional()
  @IsString()
  bookBoxCompanyId?: string;

  @IsOptional()
  @IsString()
  bookBoxCompanyCustomName?: string;

  @IsOptional()
  @IsString()
  subscriptionId?: string;

  @IsOptional()
  @IsString()
  subscriptionMonthId?: string;

  @IsOptional()
  @IsString()
  collectionId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  features?: string[];

  @IsOptional()
  @IsString()
  photoCredit?: string;
}

export class UpdateEditionDto extends BasePriceCurrencyDto {
  @IsOptional()
  @IsString()
  publisher?: string;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  additionalImages?: string[];

  @IsOptional()
  @IsBoolean()
  isSpecial?: boolean;

  @IsOptional()
  @IsBoolean()
  isOmnibus?: boolean;

  @IsOptional()
  @IsString()
  firstAccessDate?: string;

  @IsOptional()
  @IsString()
  earlyAccessDate?: string;

  @IsOptional()
  @IsString()
  generalSaleDate?: string;

  @IsOptional()
  @IsString()
  bookBoxCompanyId?: string;

  @IsOptional()
  @IsString()
  bookBoxCompanyCustomName?: string;

  @IsOptional()
  @IsString()
  subscriptionId?: string;

  @IsOptional()
  @IsString()
  subscriptionMonthId?: string;

  @IsOptional()
  collectionId?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  features?: string[];

  @IsOptional()
  @IsString()
  photoCredit?: string | null;
}

export class LinkEditionHistoryDto {
  @IsString()
  relatedEditionSlug!: string;
}

export class UnlinkEditionHistoryDto {}

export class AddArtistDto {
  @IsString()
  artistId!: string;

  @IsOptional()
  @IsString()
  artistName?: string;

  @IsOptional()
  @IsString()
  role?: string;
}

export class EditionQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @IsOptional()
  @IsString()
  bookId?: string;

  @IsOptional()
  @IsString()
  bookSlug?: string;

  @IsOptional()
  @IsString()
  companyId?: string;

  @IsOptional()
  @IsString()
  subscriptionId?: string;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  needsVerification?: boolean;
}

export class CreateComponentDto {
  @IsOptional()
  @IsString()
  bookId?: string;

  @IsOptional()
  @IsString()
  customTitle?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  volumeNumber?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  order?: number;
}

export class UpdateComponentDto {
  @IsOptional()
  @IsString()
  customTitle?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  volumeNumber?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  order?: number;
}