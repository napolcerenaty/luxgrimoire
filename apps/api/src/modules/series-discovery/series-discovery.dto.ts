import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateSeriesVolumeSuggestionStatusDto {
  @IsIn(['pending', 'approved', 'dismissed'])
  status!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  adminNote?: string;
}

export class BulkSeriesVolumeSuggestionIdsDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  ids!: string[];
}

export class BulkUpdateSeriesVolumeSuggestionStatusDto extends BulkSeriesVolumeSuggestionIdsDto {
  @IsIn(['pending', 'approved', 'dismissed'])
  status!: string;
}

export class AddExcludedKeywordDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  keyword!: string;
}
