import { IsString, IsEnum } from 'class-validator';

export type FavoriteEntityType = 'BOOK' | 'AUTHOR' | 'ARTIST' | 'COMPANY' | 'EDITION';

export class AddFavoriteDto {
  @IsEnum(['BOOK', 'AUTHOR', 'ARTIST', 'COMPANY', 'EDITION']) entityType!: FavoriteEntityType;
  @IsString() entityId!: string;
}
