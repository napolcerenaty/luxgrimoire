import { IsString, IsOptional, IsInt, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Policy types (stored as string for extensibility without DB migrations):
 * NONE                    – no skips allowed
 * UNLIMITED               – unlimited skips
 * UNLIMITED_MAX_CONSEC    – unlimited but max N consecutive before cancellation
 * CALENDAR_YEAR           – X skips per calendar year (resets Jan 1)
 * FROM_FIRST_SKIP         – X skips within N months of first skip
 * FROM_SUB_START          – X skips within N months of user's subscription start date
 * FROM_FIRST_BOX           – X skips per rolling N-month window anchored to the user's first box month
 * PREPAID_WINDOW_SKIP      – skip causes skipping the entire upcoming prepaid renewal window (all prepaidMonths months)
 */
export class UpsertSkipPolicyDto {
  @IsString()
  type!: string;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  maxSkips?: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  maxConsecutive?: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  windowMonths?: number;

  /** Days before renewal day the skip window closes (0 = day of renewal, default) */
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  skipDeadlineDaysBefore?: number;

  /** "DAYS_BEFORE" (default) | "DAY_OF_MONTH" */
  @IsOptional()
  @IsString()
  skipDeadlineType?: string;

  /** Specific day of month (1–28) when skipDeadlineType = "DAY_OF_MONTH" */
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  skipDeadlineDayOfMonth?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  /** How to submit a skip (e.g. "Email support@example.com with subject 'Skip Month Year'") */
  @IsOptional()
  @IsString()
  skipHow?: string;

  /** Whether unskipping (reversing a skip) is allowed */
  @IsOptional()
  @IsBoolean()
  allowUnskip?: boolean;

  /** "DAYS_BEFORE" (default) | "DAY_OF_MONTH" */
  @IsOptional()
  @IsString()
  unskipDeadlineType?: string;

  /** Days before renewal day the unskip window closes */
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  unskipDeadlineDaysBefore?: number;

  /** Specific day of month (1–28) when unskipDeadlineType = "DAY_OF_MONTH" */
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  unskipDeadlineDayOfMonth?: number;

  /** Notes about the unskip policy */
  @IsOptional()
  @IsString()
  unskipNotes?: string;

  /** How to submit an unskip request */
  @IsOptional()
  @IsString()
  unskipHow?: string;

  /**
   * Which billing type this policy applies to:
   * "ALL" (default) | "MONTHLY" | "PREPAID"
   */
  @IsOptional()
  @IsString()
  billingType?: string;
}

export class PreviewRecomputeDto {
  @IsString()
  type!: string;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  windowMonths?: number;
}

export class RecordSkipDto {
  @IsInt()
  @Type(() => Number)
  year!: number;

  @IsInt()
  @Type(() => Number)
  month!: number;
}
