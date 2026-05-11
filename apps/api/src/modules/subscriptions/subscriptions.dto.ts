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
  IsIn,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { BaseSubscriptionPriceCurrencyDto } from '../../common/dto/price.dto';

export class CreateSubscriptionDto extends BaseSubscriptionPriceCurrencyDto {
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
  language?: string;

  @IsOptional()
  @IsBoolean()
  shipsInternationally?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  @Type(() => Number)
  intervalMonths?: number;

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

  /** Copy all months+books from this subscription slug */
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

  @IsOptional()
  @IsBoolean()
  paymentOnStartup?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(11)
  @Type(() => Number)
  renewalMonthOffset?: number;
}

export class UpdateSubscriptionDto extends BaseSubscriptionPriceCurrencyDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  coverImage?: string | null;

  @IsOptional()
  @IsString()
  logoUrl?: string | null;

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
  language?: string;

  @IsOptional()
  @IsBoolean()
  shipsInternationally?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  @Type(() => Number)
  intervalMonths?: number;

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

  @IsOptional()
  @IsBoolean()
  paymentOnStartup?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(11)
  @Type(() => Number)
  renewalMonthOffset?: number;
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

  @IsOptional()
  @IsDateString()
  validFrom?: string;

  @IsOptional()
  @IsDateString()
  validUntil?: string;
}

export class UpdatePrepayOptionDto {
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  months?: number;

  @IsOptional()
  @IsString()
  price?: string;

  @IsOptional()
  @IsString()
  label?: string | null;

  @IsOptional()
  @IsDateString()
  validFrom?: string | null;

  @IsOptional()
  @IsDateString()
  validUntil?: string | null;
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

  @IsOptional()
  @IsIn(['unsigned', 'signed', 'digitally_signed', 'signed_bookplate'])
  signatureType?: 'unsigned' | 'signed' | 'digitally_signed' | 'signed_bookplate';

  @IsOptional()
  @IsString()
  cardArtistId?: string;
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

  @IsOptional()
  @IsIn(['unsigned', 'signed', 'digitally_signed', 'signed_bookplate'])
  signatureType?: 'unsigned' | 'signed' | 'digitally_signed' | 'signed_bookplate' | null;

  @IsOptional()
  @IsString()
  cardArtistId?: string | null;
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

  @IsOptional()
  @IsIn(['unsigned', 'signed', 'digitally_signed', 'signed_bookplate'])
  signatureType?: 'unsigned' | 'signed' | 'digitally_signed' | 'signed_bookplate';
}

export class UpdateMonthBookDto {
  @IsOptional()
  @IsIn(['unsigned', 'signed', 'digitally_signed', 'signed_bookplate', null])
  signatureType?: 'unsigned' | 'signed' | 'digitally_signed' | 'signed_bookplate' | null;
}

export class MonthQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize?: number;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  all?: boolean;
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
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  isDiscontinued?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  shipsInternationally?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeHidden?: boolean;
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

  /** If true, the subscription was already cancelled before joining (historical entry) */
  @IsOptional()
  @IsBoolean()
  alreadyCancelled?: boolean;

  /** ISO date (YYYY-MM-DD) when the subscription was cancelled — required when alreadyCancelled=true */
  @IsOptional()
  @IsString()
  cancellationDate?: string;

  /** Optional reason for cancellation */
  @IsOptional()
  @IsString()
  cancellationReason?: string;
}

export class BookPriceOverrideDto {
  @IsString()
  monthId!: string;

  @IsString()
  editionId!: string;

  @IsNumber()
  @Type(() => Number)
  price!: number;
}

export class BackfillBillingBatchFeeDto {
  @IsString()
  name!: string;

  @IsNumber()
  @Type(() => Number)
  amount!: number;

  @IsString()
  currency!: string;
}

export class BackfillBillingBatchDto {
  /** ISO date string — the actual payment date */
  @IsString()
  billedAt!: string;

  @IsNumber()
  @Type(() => Number)
  baseAmount!: number;

  @IsNumber()
  @Type(() => Number)
  monthsCovered!: number;

  @IsString()
  currency!: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  shippingAmount?: number;

  /** Month IDs covered by this billing batch (must be a subset of selectedMonthIds) */
  @IsArray()
  @IsString({ each: true })
  monthIds!: string[];

  /** Additional fees paid as part of this billing batch */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BackfillBillingBatchFeeDto)
  fees?: BackfillBillingBatchFeeDto[];
}

export class BackfillSubscriptionDto {
  /** Month IDs the user received (creates UserBookEntry per edition) */
  @IsArray()
  @IsString({ each: true })
  selectedMonthIds!: string[];

  /**
   * @deprecated Skipped months are now auto-derived from eligibleMonths minus selectedMonthIds.
   * This field is accepted for backward compatibility but ignored.
   */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  skippedMonthIds?: string[];

  /** Optional per-book price overrides for months with multiple books */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BookPriceOverrideDto)
  bookPrices?: BookPriceOverrideDto[];

  /** Billing batches for prepaid subscriptions */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BackfillBillingBatchDto)
  billingBatches?: BackfillBillingBatchDto[];
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

export class RemoveMyEntryDto {
  @IsOptional() @IsBoolean() @Transform(({ value }) => value === true || value === 'true') removeBooks?: boolean;
  @IsOptional() @IsBoolean() @Transform(({ value }) => value === true || value === 'true') removeSpending?: boolean;
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
  costCurrency?: string;

  @IsOptional()
  @IsString()
  trackingNumber?: string | null;

  /** Full replacement list of linked fee templates */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LinkedFeeTemplateDto)
  linkedFeeTemplates?: LinkedFeeTemplateDto[];
}

export class CreatePriceChangeDto {
  @IsInt()
  @Min(1)
  @Max(12)
  effectiveMonth!: number;

  @IsInt()
  @Min(2000)
  effectiveYear!: number;

  @IsNumber()
  @Min(0)
  newBasePrice!: number;

  @IsString()
  currency!: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class UpdateBillingModeDto {
  @IsOptional()
  @IsString()
  scheduledPrepayOptionId!: string | null;
}
