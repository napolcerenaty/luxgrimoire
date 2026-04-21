import {
  IsString,
  IsOptional,
  IsInt,
  IsBoolean,
  IsArray,
  Min,
  Max,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class CreateEditionDto {
  @IsString()
  bookId!: string;

  @IsOptional()
  @IsString()
  publisher?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  publishYear?: number;

  @IsOptional()
  @IsString()
  format?: string;

  @IsOptional()
  @IsString()
  coverImage?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  additionalImages?: string[];

  @IsOptional()
  @IsBoolean()
  isSpecial?: boolean;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateEditionDto {
  @IsOptional()
  @IsString()
  publisher?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  publishYear?: number;

  @IsOptional()
  @IsString()
  format?: string;

  @IsOptional()
  @IsString()
  coverImage?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  additionalImages?: string[];

  @IsOptional()
  @IsBoolean()
  isSpecial?: boolean;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class AddArtistDto {
  @IsString()
  artistId!: string;

  @IsOptional()
  @IsString()
  role?: string;
}

export class EditionQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @IsOptional()
  @IsString()
  bookId?: string;

  @IsOptional()
  @IsString()
  bookSlug?: string;
}
