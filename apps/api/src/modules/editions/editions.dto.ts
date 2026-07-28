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
  ValidateNested,
  IsDateString,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { BasePriceCurrencyDto } from '../../common/dto/price.dto';

/** One manually-entered sale date for a standalone edition (no linked SaleAnnouncement). */
export class EditionSaleDateInputDto {
  @IsString()
  label!: string;

  @IsDateString()
  date!: string;

  @IsOptional()
  @IsInt()
  order?: number;
}

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

  /** Manual sale dates for a standalone edition (no linked SaleAnnouncement).
   *  Ignored for editions linked to an announcement — those resolve live from its tiers. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EditionSaleDateInputDto)
  saleDates?: EditionSaleDateInputDto[];

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

  @IsOptional()
  @IsString()
  variantLabel?: string;

  /** When set, the new edition is linked into this edition's variant group (resolved to the group's root server-side). */
  @IsOptional()
  @IsString()
  sourceEditionId?: string;
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
  @IsString()
  firstAccessDate?: string;

  @IsOptional()
  @IsString()
  earlyAccessDate?: string;

  @IsOptional()
  @IsString()
  generalSaleDate?: string;

  /** Manual sale dates for a standalone edition (no linked SaleAnnouncement).
   *  Ignored for editions linked to an announcement — those resolve live from its tiers. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EditionSaleDateInputDto)
  saleDates?: EditionSaleDateInputDto[];

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

  @IsOptional()
  @IsString()
  variantLabel?: string | null;
}

export class LinkEditionHistoryDto {
  @IsString()
  relatedEditionSlug!: string;
}

export class UnlinkEditionHistoryDto {}

export class LinkVariantDto {
  @IsString()
  relatedEditionSlug!: string;
}

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

  @IsOptional()
  @IsString()
  collectionId?: string; // filter by specific collection

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  exclusiveOnly?: boolean; // collectionId IS NULL AND subscriptionId IS NULL

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  noSubscription?: boolean; // subscriptionId IS NULL

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  hasOfficialPhoto?: boolean; // additionalImages not empty
}

export class UpdateArtistRoleDto {
  @IsString()
  newRole!: string;
}