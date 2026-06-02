import { IsString, IsNumber, IsOptional, IsArray, IsDateString, IsIn, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class SaleGroupsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  pageSize?: number;

  @IsOptional()
  @IsString()
  search?: string;
}

export class CreateSaleGroupDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsNumber()
  @Min(0)
  totalAmount: number = 0;

  @IsString()
  currency: string = '';

  @IsString()
  platform: string = '';

  @IsDateString()
  soldAt: string = '';

  @IsString()
  @IsOptional()
  notes?: string;

  @IsIn(['EQUAL', 'CUSTOM'])
  priceDistribution: 'EQUAL' | 'CUSTOM' = 'EQUAL';

  /** userBookEntry IDs to include in the sale */
  @IsArray()
  @IsString({ each: true })
  entryIds: string[] = [];

  /** Required when priceDistribution === 'CUSTOM'. Map of entryId -> allocatedAmount */
  @IsOptional()
  customAmounts?: Record<string, number>;
}

export class UpdateSaleGroupDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  totalAmount?: number;

  @IsString()
  @IsOptional()
  currency?: string;

  @IsString()
  @IsOptional()
  platform?: string;

  @IsDateString()
  @IsOptional()
  soldAt?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  /** Per-entry custom amounts (entryId -> amount). When provided, overrides equal redistribution. */
  @IsOptional()
  customAmounts?: Record<string, number>;
}
