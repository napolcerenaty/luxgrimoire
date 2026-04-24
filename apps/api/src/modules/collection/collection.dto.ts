import { IsString, IsOptional, IsBoolean } from 'class-validator';

export class AddToCollectionDto {
  @IsString() bookEditionId!: string;
  @IsOptional() @IsString() condition?: string;
  @IsOptional() @IsBoolean() isWishlist?: boolean;
  @IsOptional() @IsString() ownershipStatus?: string;
  @IsOptional() @IsString() readingStatus?: string;
}

export class UpdateCollectionEntryDto {
  @IsOptional() @IsString() condition?: string;
  @IsOptional() @IsBoolean() isWishlist?: boolean;
  @IsOptional() @IsString() ownershipStatus?: string;
  @IsOptional() @IsString() readingStatus?: string;
}
