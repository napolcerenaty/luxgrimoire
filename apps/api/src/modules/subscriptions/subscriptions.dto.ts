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
  isContentStream?: boolean;

  @IsOptional()
  @IsBoolean()
  isBundleSubscription?: boolean;

  @IsOptional()
  @IsBoolean()
  hasBookChoiceMonths?: boolean;

  @IsOptional()
  @IsBoolean()
  paymentOnStartup?: boolean;

  @IsOptional()
  @IsBoolean()
  isUpcoming?: boolean;

  @IsOptional()
  @IsString()
  upcomingNote?: string;

  @IsOptional()
  @IsString()
  waitlistLink?: string;

  @IsOptional()
  @IsBoolean()
  signupIncludesCurrentMonth?: boolean;

  @IsOptional()
  @IsInt()
  @Min(-11)
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
  isContentStream?: boolean;

  @IsOptional()
  @IsBoolean()
  isBundleSubscription?: boolean;

  @IsOptional()
  @IsBoolean()
  hasBookChoiceMonths?: boolean;

  @IsOptional()
  @IsBoolean()
  paymentOnStartup?: boolean;

  @IsOptional()
  @IsBoolean()
  isUpcoming?: boolean;

  @IsOptional()
  @IsString()
  upcomingNote?: string;

  @IsOptional()
  @IsString()
  waitlistLink?: string;

  @IsOptional()
  @IsBoolean()
  signupIncludesCurrentMonth?: boolean;

  @IsOptional()
  @IsInt()
  @Min(-11)
  @Max(11)
  @Type(() => Number)
  renewalMonthOffset?: number;

  /**
   * Required when any tracked settings field (renewalDay, renewalDayUserSet,
   * paymentOnStartup, signupIncludesCurrentMonth, renewalMonthOffset) is changed.
   * Specifies the date from which the new settings take effect.
   * This is NOT a DB column — it drives the effectiveFrom of the settings history record.
   */
  @IsOptional()
  @IsDateString()
  settingsEffectiveFrom?: string;
}

export class CreatePrepayOptionDto {
  @IsInt()
  @Type(() => Number)
  months!: number;

  @IsString()
  price!: string;

  @IsString()
  currency!: string;

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
  currency?: string;

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

export class YearMonthQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month!: number;
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
  @IsIn(['unsigned', 'signed', 'autopen', 'digitally_signed', 'signed_bookplate', 'stamped'])
  signatureType?: 'unsigned' | 'signed' | 'autopen' | 'digitally_signed' | 'signed_bookplate' | 'stamped';

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
  @IsIn(['unsigned', 'signed', 'autopen', 'digitally_signed', 'signed_bookplate', 'stamped'])
  signatureType?: 'unsigned' | 'signed' | 'autopen' | 'digitally_signed' | 'signed_bookplate' | 'stamped' | null;

  @IsOptional()
  @IsString()
  cardArtistId?: string | null;
}

export class AddMonthBookDto {
  @IsString()
  bookId!: string;

  @IsString()
  editionId!: string;

  @IsOptional()
  @IsBoolean()
  isMainBook?: boolean;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  sortOrder?: number;

  @IsOptional()
  @IsIn(['unsigned', 'signed', 'autopen', 'digitally_signed', 'signed_bookplate', 'stamped'])
  signatureType?: 'unsigned' | 'signed' | 'autopen' | 'digitally_signed' | 'signed_bookplate' | 'stamped';
}

export class UpdateMonthBookDto {
  @IsOptional()
  @IsIn(['unsigned', 'signed', 'autopen', 'digitally_signed', 'signed_bookplate', 'stamped', null])
  signatureType?: 'unsigned' | 'signed' | 'autopen' | 'digitally_signed' | 'signed_bookplate' | 'stamped' | null;
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
  @Max(500)
  pageSize?: number;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  all?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  ownOnly?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  fromYear?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  fromMonth?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  untilYear?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  untilMonth?: number;
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
  @Max(500)
  pageSize?: number;

  @IsOptional()
  @IsString()
  companyId?: string;

  @IsOptional()
  @IsString()
  companySlug?: string;

  @IsOptional()
  @IsString()
  search?: string;

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

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  isContentStream?: boolean;

  @IsOptional()
  @IsString()
  status?: string;

  /** Filter by skip policy type: NONE | UNLIMITED | UNLIMITED_MAX_CONSEC | CALENDAR_YEAR | FROM_FIRST_SKIP | FROM_SUB_START | PREPAID_WINDOW_SKIP */
  @IsOptional()
  @IsString()
  skipPolicyType?: string;

  /** Filter by billing type the skip policy applies to: ALL | MONTHLY | PREPAID */
  @IsOptional()
  @IsString()
  skipPolicyBillingType?: string;
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
  @IsBoolean()
  isForwarding?: boolean;

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

  /** Selected prepay option ID — used to set prepaidMonths and scheduledPrepayOptionId atomically at join time */
  @IsOptional()
  @IsString()
  selectedPrepayOptionId?: string | null;

  /** If true, compute eligible months without persisting the subscription entry (preview/dry run) */
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
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

export class BackfillBillingBatchDiscountDto {
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

  /** Discounts applied to this billing batch */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BackfillBillingBatchDiscountDto)
  discounts?: BackfillBillingBatchDiscountDto[];
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

  /** Ownership status to assign to backfilled books. Defaults to OWNED on the backend. */
  @IsOptional()
  @IsIn(['OWNED', 'PREORDER'])
  backfillOwnershipStatus?: 'OWNED' | 'PREORDER';
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
  @IsOptional() @IsBoolean() @Transform(({ value }) => value === true || value === 'true') removeSoldBooks?: boolean;
  /** If provided, remove only the books from this specific membership period */
  @IsOptional() @IsString() historyId?: string;
  /** If provided, remove only the specified membership periods (multi-select) */
  @IsOptional() @IsArray() @IsString({ each: true }) historyIds?: string[];
  /** If true, remove all membership periods and optionally their books/spending */
  @IsOptional() @IsBoolean() @Transform(({ value }) => value === true || value === 'true') removeAllPeriods?: boolean;
  /** If true, remove only the current active period but keep historical records */
  @IsOptional() @IsBoolean() @Transform(({ value }) => value === true || value === 'true') removeCurrentOnly?: boolean;
}

export class RemoveOrphanedHistoryDto {
  @IsOptional() @IsBoolean() @Transform(({ value }) => value === true || value === 'true') removeBooks?: boolean;
  @IsOptional() @IsBoolean() @Transform(({ value }) => value === true || value === 'true') removeSpending?: boolean;
  @IsOptional() @IsBoolean() @Transform(({ value }) => value === true || value === 'true') removeSoldBooks?: boolean;
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

  @IsOptional()
  @IsBoolean()
  isForwarding?: boolean;

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

  @IsBoolean()
  @IsOptional()
  grandfatheredPrice?: boolean;
}

export class UpdatePriceChangeDto {
  @IsNumber()
  @Min(0)
  newBasePrice!: number;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsBoolean()
  @IsOptional()
  grandfatheredPrice?: boolean;
}

export class UpdateBillingModeDto {
  @IsOptional()
  @IsString()
  scheduledPrepayOptionId!: string | null;
}

export class UpdateSettingsHistoryEffectiveFromDto {
  /** ISO date string (YYYY-MM-DD or full ISO) for the new effectiveFrom value. Omit to leave unchanged. */
  @IsOptional()
  @IsString()
  effectiveFrom?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsInt()
  renewalDay?: number | null;

  @IsOptional()
  @IsBoolean()
  renewalDayUserSet?: boolean;

  @IsOptional()
  @IsBoolean()
  paymentOnStartup?: boolean;

  @IsOptional()
  @IsBoolean()
  signupIncludesCurrentMonth?: boolean;

  @IsOptional()
  @IsInt()
  renewalMonthOffset?: number;
}

export class MigrateMonthsDto {
  @IsString()
  targetSubscriptionId!: string;
}

export class ManageSkipsMonthDto {
  @IsInt()
  year!: number;

  @IsInt()
  @Min(1)
  @Max(12)
  month!: number;
}

export class ManageSkipsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ManageSkipsMonthDto)
  toSkip!: ManageSkipsMonthDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ManageSkipsMonthDto)
  toUnskip!: ManageSkipsMonthDto[];

  @IsBoolean()
  addBooksForUnskipped!: boolean;

  @IsBoolean()
  removeBooksForSkipped!: boolean;

  @IsOptional()
  @IsIn(['OWNED', 'PREORDER'])
  ownershipStatusForUnskipped?: 'OWNED' | 'PREORDER';
}

export class CreateChoiceGroupDto {
  /** SubscriptionMonthBook row ids (already attached to this month) to group as alternatives. */
  @IsArray()
  @IsString({ each: true })
  monthBookIds!: string[];

  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsBoolean()
  allowMultiple?: boolean;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  choiceDeadlineDaysBefore?: number;

  @IsOptional()
  @IsIn(['DAYS_BEFORE', 'DAY_OF_MONTH'])
  choiceDeadlineType?: string;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  choiceDeadlineDayOfMonth?: number;
}

export class SubmitMonthChoiceDto {
  /** SubscriptionMonthBook row id(s) within the choice group being picked (1, or 2+ if allowMultiple). */
  @IsArray()
  @IsString({ each: true })
  monthBookIds!: string[];
}

export class AdminBackfillChoiceDto extends SubmitMonthChoiceDto {
  @IsString()
  userId!: string;
}
