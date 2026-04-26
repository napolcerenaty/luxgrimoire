import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateFeatureRequestDto {
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title!: string;

  @IsString()
  @MinLength(5)
  @MaxLength(5000)
  description!: string;
}
