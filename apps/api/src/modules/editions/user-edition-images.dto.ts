import { IsArray, IsBoolean, IsInt, IsOptional, IsString, Min, ValidateNested, IsNotEmpty, Matches, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UserImageItemDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  cloudinaryId!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  url!: string;

  @ApiProperty()
  @IsInt()
  @Min(0)
  sortOrder!: number;
}

export class SubmitUserEditionImagesDto {
  @ApiProperty({ type: [UserImageItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UserImageItemDto)
  images!: UserImageItemDto[];

  @ApiPropertyOptional({ description: 'Instagram handle without @' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  @Matches(/^[a-z0-9_.]+$/i, { message: 'Invalid Instagram handle' })
  instagramHandle?: string;

  @ApiProperty({ description: 'Must be true — user confirms authorship and consent' })
  @IsBoolean()
  consentGiven!: boolean;
}

export class UpdateImageStatusDto {
  @ApiProperty({ enum: ['APPROVED', 'REMOVED'] })
  @IsString()
  status!: 'APPROVED' | 'REMOVED';
}
