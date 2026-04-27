import { IsString, IsOptional, IsBoolean, IsIn, IsArray } from 'class-validator';

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

export const READING_STATUSES = ['UNREAD', 'READ', 'DNF'] as const;
export type ReadingStatus = typeof READING_STATUSES[number];

export class AddToCollectionDto {
  @IsString() bookEditionId!: string;
  @IsOptional() @IsString() condition?: string;
  @IsOptional() @IsBoolean() isWishlist?: boolean;
  @IsOptional() @IsIn(OWNERSHIP_STATUSES) ownershipStatus?: OwnershipStatus;
  @IsOptional() @IsIn(READING_STATUSES) readingStatus?: ReadingStatus;
}

export class UpdateCollectionEntryDto {
  @IsOptional() @IsString() condition?: string;
  @IsOptional() @IsBoolean() isWishlist?: boolean;
  @IsOptional() @IsIn(OWNERSHIP_STATUSES) ownershipStatus?: OwnershipStatus;
  @IsOptional() @IsIn(READING_STATUSES) readingStatus?: ReadingStatus;
}

export class AddToWishlistDto {
  @IsString() bookEditionId!: string;
}

export class SetEditionTagsDto {
  @IsArray()
  @IsString({ each: true })
  tags!: string[];
}
