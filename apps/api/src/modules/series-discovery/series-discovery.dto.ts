import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateSeriesVolumeSuggestionStatusDto {
  @IsIn(['pending', 'approved', 'dismissed'])
  status!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  adminNote?: string;
}
