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

  @IsOptional()
  @IsString()
  notes?: string;
}

export class RecordSkipDto {
  @IsInt()
  @Type(() => Number)
  year!: number;

  @IsInt()
  @Type(() => Number)
  month!: number;
}
