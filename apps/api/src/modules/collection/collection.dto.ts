import { IsString, IsOptional, IsBoolean, IsIn, IsArray, IsDateString } from 'class-validator';

export const OWNERSHIP_STATUSES = [
  'PREORDER',
  'SHIPPING',
  'OWNED',
  'BORROWED',
  'LENDED',
  'SOLD',
  'GIFTED_AWAY',
  'TO_SELL',
] as const;

export type OwnershipStatus = typeof OWNERSHIP_STATUSES[number];

export const READING_STATUSES = ['UNREAD', 'READING', 'READ', 'DNF'] as const;
export type ReadingStatus = typeof READING_STATUSES[number];

export class AddToCollectionDto {
  @IsString() bookEditionId!: string;
  @IsOptional() @IsString() condition?: string;
  @IsOptional() @IsBoolean() isWishlist?: boolean;
  @IsOptional() @IsIn(OWNERSHIP_STATUSES) ownershipStatus?: OwnershipStatus;
  @IsOptional() @IsIn(READING_STATUSES) readingStatus?: ReadingStatus;
  @IsOptional() @IsString() saleAnnouncementEditionId?: string;
  /** Analytics only — not stored in DB */
  @IsOptional() @IsString() _entityName?: string;
}

export class UpdateCollectionEntryDto {
  @IsOptional() @IsString() condition?: string;
  @IsOptional() @IsBoolean() isWishlist?: boolean;
  @IsOptional() @IsIn(OWNERSHIP_STATUSES) ownershipStatus?: OwnershipStatus;
  @IsOptional() @IsIn(READING_STATUSES) readingStatus?: ReadingStatus;
  @IsOptional() @IsDateString() acquiredAt?: string;
  @IsOptional() @IsString() trackingNumber?: string;
  @IsOptional() @IsString() salePrice?: string;
  @IsOptional() @IsString() saleCurrency?: string;
  @IsOptional() @IsString() saleDate?: string;
  @IsOptional() @IsString() saleVenue?: string;
  @IsOptional() @IsString() saleNotes?: string;
  @IsOptional() @IsIn(['unsigned', 'signed', 'digitally_signed', 'signed_bookplate', null]) signatureType?: string | null;
  @IsOptional() @IsString() saleAnnouncementEditionId?: string | null;
}

export class AddToWishlistDto {
  @IsString() bookEditionId!: string;
  /** Analytics only — not stored in DB */
  @IsOptional() @IsString() _entityName?: string;
}

export class UpdateEditionOwnershipDto {
  @IsIn(OWNERSHIP_STATUSES) ownershipStatus!: OwnershipStatus;
}

export class SetEditionTagsDto {
  @IsArray()
  @IsString({ each: true })
  tags!: string[];
}
