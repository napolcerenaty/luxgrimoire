import { IsString, IsNumber, IsOptional, IsArray, IsBoolean, IsDateString, Min } from 'class-validator';

export class CreatePurchaseGroupDto {
  @IsString()
  @IsOptional()
  saleAnnouncementId?: string;

  @IsString()
  @IsOptional()
  title?: string;

  @IsNumber()
  @Min(0)
  totalAmount: number = 0;

  @IsString()
  currency: string = '';

  @IsNumber()
  @IsOptional()
  @Min(0)
  shippingAmount?: number;

  @IsDateString()
  purchasedAt: string = '';

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  ownershipStatus?: string;

  @IsBoolean()
  @IsOptional()
  isSecondHand?: boolean;

  @IsString()
  @IsOptional()
  sourcePlatform?: string;

  /** Array of editionIds to add to collection as part of this bundle */
  @IsArray()
  @IsString({ each: true })
  editionIds: string[] = [];
}

export class ConfirmSalePurchaseDto {
  @IsString()
  tier: string = 'GS';

  @IsNumber()
  @Min(0)
  totalAmount: number = 0;

  @IsString()
  currency: string = '';

  @IsNumber()
  @IsOptional()
  @Min(0)
  shippingAmount?: number;

  @IsDateString()
  purchasedAt: string = '';

  @IsString()
  @IsOptional()
  notes?: string;

  @IsArray()
  @IsString({ each: true })
  editionIds: string[] = [];
}

export class CreateGroupForEntryDto {
  @IsNumber()
  @Min(0)
  totalAmount: number = 0;

  @IsString()
  currency: string = '';

  @IsNumber()
  @IsOptional()
  @Min(0)
  shippingAmount?: number;

  @IsDateString()
  purchasedAt: string = '';

  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class UpdatePurchaseGroupDto {
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

  @IsNumber()
  @IsOptional()
  @Min(0)
  shippingAmount?: number;

  @IsDateString()
  @IsOptional()
  purchasedAt?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsBoolean()
  @IsOptional()
  fromSubscription?: boolean;

  @IsBoolean()
  @IsOptional()
  isSecondHand?: boolean;

  @IsString()
  @IsOptional()
  sourcePlatform?: string;
}
