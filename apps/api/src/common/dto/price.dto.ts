import { IsString, IsOptional, IsNumber } from 'class-validator';

/** Shared optional price (string) + currency fields — used by editions and subscriptions DTOs */
export class BasePriceCurrencyDto {
  @IsOptional()
  @IsString()
  basePrice?: string;

  @IsOptional()
  @IsString()
  currency?: string;
}

/** Shared optional price (number) + currency fields — used by announcement DTOs */
export class BaseNumericPriceCurrencyDto {
  @IsOptional()
  @IsNumber()
  basePrice?: number;

  @IsOptional()
  @IsString()
  currency?: string;
}

/** Shared optional price (string) + currency fields — used by subscription DTOs */
export class BaseSubscriptionPriceCurrencyDto {
  @IsOptional()
  @IsString()
  price?: string;

  @IsOptional()
  @IsString()
  currency?: string;
}
