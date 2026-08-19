import { IsString, IsOptional, IsInt, IsObject, IsBoolean, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class BookSeriesQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

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
}

export class CreateBookSeriesDto {
  @IsString()
  name!: string;
}

export class UpdateBookSeriesDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsBoolean()
  isCompleted?: boolean;
}

export class SwitchPrimarySeriesDto {
  @IsString()
  toSeriesSlug!: string;

  /** Optional per-book volume numbers in the target series, keyed by bookId — lets the admin
   * modal set these as part of the switch instead of needing a manual per-book fix afterward. */
  @IsOptional()
  @IsObject()
  volumeNumbers?: Record<string, number[]>;
}
