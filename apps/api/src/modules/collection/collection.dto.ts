import { IsString, IsOptional, IsBoolean, IsDateString } from 'class-validator';

export class AddToCollectionDto {
  @IsString() bookEditionId!: string;
  @IsOptional() @IsDateString() acquiredDate?: string;
  @IsOptional() @IsString() condition?: string;
  @IsOptional() @IsBoolean() isWishlist?: boolean;
  @IsOptional() @IsString() notes?: string;
}

export class UpdateCollectionEntryDto {
  @IsOptional() @IsDateString() acquiredDate?: string;
  @IsOptional() @IsString() condition?: string;
  @IsOptional() @IsBoolean() isWishlist?: boolean;
  @IsOptional() @IsString() notes?: string;
}
