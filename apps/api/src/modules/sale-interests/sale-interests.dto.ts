import { IsString, IsOptional, IsNumber } from 'class-validator';

/** tierId replaces the old free-text 'FA'|'EA'|'GS' tier code — every tier is now a concrete
 *  SaleTier row (arbitrary name, any count), so the client picks one by id. regionId is no
 *  longer accepted separately: it's derived from the chosen tier's own regionId. */
export class UpsertSaleInterestDto {
  @IsString()
  tierId: string = '';

  @IsOptional()
  @IsNumber()
  selectedPrice?: number | null;

  @IsOptional()
  @IsString()
  selectedPriceCurrency?: string | null;
}
