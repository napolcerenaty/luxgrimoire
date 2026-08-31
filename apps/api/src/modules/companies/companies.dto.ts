import { IsString, IsOptional, IsBoolean, IsInt, Min, Max, ValidateIf } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateCompanyDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  logoUrl?: string;

  @IsOptional()
  @IsString()
  website?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  defaultCurrency?: string;

  @IsOptional()
  @IsString()
  instagram?: string;

  @IsOptional()
  @IsString()
  threads?: string;

  @IsOptional()
  @IsString()
  tiktok?: string;

  @IsOptional()
  @IsString()
  facebook?: string;

  @IsOptional()
  @IsString()
  x?: string;

  @IsOptional()
  @IsString()
  bluesky?: string;

  @IsOptional()
  @IsBoolean()
  iossImplemented?: boolean;
}

export class UpdateCompanyDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  description?: string | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  logoUrl?: string | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  website?: string | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  country?: string | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  defaultCurrency?: string | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  instagram?: string | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  threads?: string | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  tiktok?: string | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  facebook?: string | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  x?: string | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  bluesky?: string | null;

  @IsOptional()
  @IsBoolean()
  iossImplemented?: boolean;
}

export class CompanyQueryDto {
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
  search?: string;

  @IsOptional()
  @IsString()
  country?: string;
}
