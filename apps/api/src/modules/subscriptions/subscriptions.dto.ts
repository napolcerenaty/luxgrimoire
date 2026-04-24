import {
  IsString,
  IsOptional,
  IsInt,
  IsBoolean,
  IsArray,
  Min,
  Max,
  IsDateString,
  IsNumber,
  ValidateNested,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class CreateSubscriptionDto {
  @IsString()
  companyId!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  coverImage?: string;

  @IsOptional()
  @IsString()
  logoUrl?: string;

  @IsOptional()
  @IsString()
  genre?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  genres?: string[];

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsBoolean()
  isDiscontinued?: boolean;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  price?: string;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsBoolean()
  shipsInternationally?: boolean;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  contentType?: string;

  @IsOptional()
  @IsBoolean()
  bookishMerch?: boolean;

  @IsOptional()
  @IsBoolean()
  isCombo?: boolean;

  @IsOptional()
  @IsString()
  parentSubscriptionId?: string;

  /** If provided, copy all months+books from this subscription slug */
  @IsOptional()
  @IsString()
  copyFromSlug?: string;

  /** Component subscription IDs (for combo subscriptions) */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  componentIds?: string[];

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  renewalDay?: number;

  @IsOptional()
  @IsBoolean()
  renewalDayUserSet?: boolean;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  startingMonth?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  shippingCountries?: string[];

  @IsOptional()
  @IsBoolean()
  isHidden?: boolean;
}

export class UpdateSubscriptionDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  coverImage?: string;

  @IsOptional()
  @IsString()
  logoUrl?: string;

  @IsOptional()
  @IsString()
  genre?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  genres?: string[];

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsBoolean()
  isDiscontinued?: boolean;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  price?: string;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsBoolean()
  shipsInternationally?: boolean;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  contentType?: string;

  @IsOptional()
  @IsBoolean()
  bookishMerch?: boolean;

  @IsOptional()
  @IsBoolean()
  isCombo?: boolean;

  @IsOptional()
  @IsString()
  parentSubscriptionId?: string;

  /** Replace combo components with these subscription IDs */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  componentIds?: string[];

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  renewalDay?: number;

  @IsOptional()
  @IsBoolean()
  renewalDayUserSet?: boolean;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  startingMonth?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  shippingCountries?: string[];

  @IsOptional()
  @IsBoolean()
  isHidden?: boolean;
}

export class CreatePrepayOptionDto {
  @IsInt()
  @Type(() => Number)
  months!: number;

  @IsString()
  price!: string;

  @IsOptional()
  @IsString()
  label?: string;
}

export class CreateMonthDto {
  @Type(() => Number)
  @IsInt()
  year!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month!: number;

  @IsOptional()
  @IsString()
  theme?: string;

  @IsOptional()
  @IsString()
  coverImage?: string;

  @IsOptional()
  @IsString()
  spoilerImage?: string;

  @IsOptional()
  @IsBoolean()
  isSpoiler?: boolean;

  @IsOptional()
  @IsString()
  actualShipping?: string;

  @IsOptional()
  @IsString()
  boxPrice?: string;
}

export class UpdateMonthDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  year?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month?: number;

  @IsOptional()
  @IsString()
  theme?: string;

  @IsOptional()
  @IsString()
  coverImage?: string;

  @IsOptional()
  @IsString()
  spoilerImage?: string;

  @IsOptional()
  @IsBoolean()
  isSpoiler?: boolean;

  @IsOptional()
  @IsString()
  actualShipping?: string;

  @IsOptional()
  @IsString()
  boxPrice?: string;
}

export class AddMonthBookDto {
  @IsString()
  bookId!: string;

  @IsOptional()
  @IsString()
  editionId?: string;

  @IsOptional()
  @IsBoolean()
  isMainBook?: boolean;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  sortOrder?: number;
}

export class SubscriptionQueryDto {
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
  companyId?: string;

  @IsOptional()
  @IsString()
  companySlug?: string;

  @IsOptional()
  @IsString()
  genre?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  isDiscontinued?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  shipsInternationally?: boolean;
}

export class LinkedFeeTemplateDto {
  @IsString()
  templateId!: string;

  /** Override amount (if omitted, uses template's defaultAmount) */
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  customAmount?: number;

  /** Override currency (if omitted, uses template's defaultCurrency) */
  @IsOptional()
  @IsString()
  customCurrency?: string;
}

export class JoinSubscriptionDto {
  /** Start date — YYYY-MM-DD (when subscription has renewalDay) or YYYY-MM */
  @IsOptional()
  @IsString()
  startDate?: string;

  /** Currency for basePrice, shipping + taxes */
  @IsOptional()
  @IsString()
  costCurrency?: string;

  @IsOptional()
  @IsString()
  basePrice?: string;

  @IsOptional()
  @IsString()
  shippingCost?: string;

  @IsOptional()
  @IsString()
  taxesAndFees?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  @Type(() => Number)
  renewalDay?: number;

  /** Fee templates to link to this subscription entry */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LinkedFeeTemplateDto)
  linkedFeeTemplates?: LinkedFeeTemplateDto[];
}

export class BackfillSubscriptionDto {
  /** Month IDs the user received (creates UserBookEntry per edition) */
  @IsArray()
  @IsString({ each: true })
  selectedMonthIds!: string[];

  /** Month IDs the user skipped (creates UserSkipRecord) */
  @IsArray()
  @IsString({ each: true })
  skippedMonthIds!: string[];
}

export class CancelMyEntryDto {
  /** ISO date string YYYY-MM-DD for when the subscription was cancelled */
  @IsOptional()
  @IsString()
  cancellationDate?: string;

  /** Optional reason for cancellation */
  @IsOptional()
  @IsString()
  cancellationReason?: string;
}

export class UpdateMyEntryCostsDto {
  @IsOptional()
  @IsString()
  basePrice?: string;

  @IsOptional()
  @IsString()
  shippingCost?: string;

  @IsOptional()
  @IsString()
  taxesAndFees?: string;

  @IsOptional()
  @IsString()
  costCurrency?: string;

  /** Full replacement list of linked fee templates */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LinkedFeeTemplateDto)
  linkedFeeTemplates?: LinkedFeeTemplateDto[];
}
