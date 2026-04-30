import { IsString, IsNumber, IsOptional, IsBoolean, IsEnum, IsDateString, Min } from 'class-validator';

export enum FeeCategoryDto {
  VAT = 'VAT',
  CUSTOMS = 'CUSTOMS',
  PROCESSING = 'PROCESSING',
  FORWARDING = 'FORWARDING',
  OTHER = 'OTHER',
}

export class CreateFeeTemplateDto {
  @IsString()
  name: string = '';

  @IsEnum(FeeCategoryDto)
  @IsOptional()
  category?: FeeCategoryDto;

  @IsNumber()
  @IsOptional()
  @Min(0)
  defaultAmount?: number;

  @IsString()
  @IsOptional()
  defaultCurrency?: string;
}

export class UpdateFeeTemplateDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsEnum(FeeCategoryDto)
  @IsOptional()
  category?: FeeCategoryDto;

  @IsNumber()
  @IsOptional()
  @Min(0)
  defaultAmount?: number;

  @IsString()
  @IsOptional()
  defaultCurrency?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class CreatePurchaseFeeDto {
  @IsString()
  @IsOptional()
  feeTemplateId?: string;

  @IsString()
  name: string = '';

  @IsNumber()
  @Min(0)
  amount: number = 0;

  @IsString()
  currency: string = 'PLN';

  @IsDateString()
  date: string = '';

  @IsEnum(FeeCategoryDto)
  @IsOptional()
  category?: FeeCategoryDto;

  @IsString()
  @IsOptional()
  billingPeriodId?: string;

  @IsString()
  @IsOptional()
  purchaseGroupId?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class UpdatePurchaseFeeDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  amount?: number;

  @IsString()
  @IsOptional()
  currency?: string;

  @IsDateString()
  @IsOptional()
  date?: string;

  @IsEnum(FeeCategoryDto)
  @IsOptional()
  category?: FeeCategoryDto;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class CreatePurchaseDiscountDto {
  @IsString()
  name: string = '';

  @IsNumber()
  @Min(0)
  amount: number = 0;

  @IsString()
  currency: string = '';

  @IsDateString()
  date: string = '';

  @IsString()
  @IsOptional()
  billingPeriodId?: string;

  @IsString()
  @IsOptional()
  purchaseGroupId?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class UpdatePurchaseDiscountDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  amount?: number;

  @IsString()
  @IsOptional()
  currency?: string;

  @IsDateString()
  @IsOptional()
  date?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class CreatePurchaseRefundDto {
  @IsNumber()
  @Min(0)
  amount: number = 0;

  @IsString()
  currency: string = '';

  @IsDateString()
  date: string = '';

  @IsString()
  @IsOptional()
  billingPeriodId?: string;

  @IsString()
  @IsOptional()
  purchaseGroupId?: string;

  @IsString()
  @IsOptional()
  reason?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
