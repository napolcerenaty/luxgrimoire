import { IsString, IsUrl } from 'class-validator';

export class SetFeatureImageDto {
  @IsString()
  @IsUrl()
  imageUrl!: string;
}
