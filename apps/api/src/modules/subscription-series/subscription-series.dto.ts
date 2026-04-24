import { IsString, IsOptional, IsBoolean, IsInt, Min, Max } from 'class-validator';

export class CreateSubscriptionSeriesDto {
  @IsString()
  subscriptionId!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  coverImage?: string;

  @IsInt() @Min(1) @Max(12)
  startMonth!: number;

  @IsInt()
  startYear!: number;

  @IsInt() @Min(1) @Max(12)
  endMonth!: number;

  @IsInt()
  endYear!: number;

  // INDIVIDUAL | SERIES_ONLY
  @IsOptional()
  @IsString()
  skipMode?: string;

  @IsOptional()
  @IsBoolean()
  canCancelDuring?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateSubscriptionSeriesDto {
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
  @IsInt() @Min(1) @Max(12)
  startMonth?: number;

  @IsOptional()
  @IsInt()
  startYear?: number;

  @IsOptional()
  @IsInt() @Min(1) @Max(12)
  endMonth?: number;

  @IsOptional()
  @IsInt()
  endYear?: number;

  @IsOptional()
  @IsString()
  skipMode?: string;

  @IsOptional()
  @IsBoolean()
  canCancelDuring?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class AssignMonthsToSeriesDto {
  @IsString({ each: true })
  monthIds!: string[];
}
