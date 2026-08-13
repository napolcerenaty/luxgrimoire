import { IsString, IsNumber, IsOptional, IsArray, IsBoolean, IsDateString, IsIn, Min } from 'class-validator';

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
  orderNumber?: string;

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

  /** Optional map of editionId → signatureType for variant selection */
  @IsOptional()
  editionSignatureTypes?: Record<string, string>;

  /** Optional map of editionId → saleAnnouncementEditionId for print tracking */
  @IsOptional()
  editionSaleAnnouncementEditionIds?: Record<string, string>;

  /** How UserBookEntry.basePrice is allocated across editionIds. Mirrors UserSaleGroup.priceDistribution. */
  @IsOptional()
  @IsIn(['EQUAL', 'CUSTOM'])
  priceDistribution?: 'EQUAL' | 'CUSTOM' = 'EQUAL';

  /** Required (per editionId) when priceDistribution === 'CUSTOM'. Map of editionId → basePrice */
  @IsOptional()
  editionPrices?: Record<string, number>;
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

  @IsBoolean()
  @IsOptional()
  isSecondHand?: boolean;

  @IsString()
  @IsOptional()
  sourcePlatform?: string;
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

  /** How UserBookEntry.basePrice is allocated across this group's books. Mirrors UserSaleGroup.priceDistribution. */
  @IsOptional()
  @IsIn(['EQUAL', 'CUSTOM'])
  priceDistribution?: 'EQUAL' | 'CUSTOM';

  /** Map of userBookEntry id → basePrice. Required (per entry) when priceDistribution === 'CUSTOM'. */
  @IsOptional()
  entryPrices?: Record<string, number>;
}
