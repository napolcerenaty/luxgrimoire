import { IsString, IsOptional, IsNumber } from 'class-validator';
import { Transform } from 'class-transformer';

/** tierId replaces the old free-text 'FA'|'EA'|'GS' tier code — every tier is now a concrete
 *  SaleTier row (arbitrary name, any count), so the client picks one by id. regionId is no
 *  longer accepted separately: it's derived from the chosen tier's own regionId. */
export class UpsertSaleInterestDto {
  @IsString()
  tierId: string = '';

  // Prisma Decimal fields (e.g. SaleAnnouncement.subscriberBasePrice) serialize to JSON as
  // strings, and the frontend passes that string straight through as selectedPrice — coerce it
  // here so @IsNumber() doesn't reject a valid price just because it arrived as "22.00" instead
  // of 22. (selectedPrice's `number | null` union type also defeats class-transformer's implicit
  // conversion, since emitDecoratorMetadata can't reduce a union to a single design:type.)
  @IsOptional()
  @Transform(({ value }) => value == null || value === '' ? value : Number(value))
  @IsNumber()
  selectedPrice?: number | null;

  @IsOptional()
  @IsString()
  selectedPriceCurrency?: string | null;
}
