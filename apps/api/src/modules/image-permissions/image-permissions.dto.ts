import { IsArray, IsBoolean, IsDateString, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export enum ImagePermissionStatusDto {
  PENDING = 'PENDING',
  GRANTED = 'GRANTED',
  REVOKED = 'REVOKED',
  DENIED = 'DENIED',
}

export enum ContactChannelDto {
  EMAIL = 'EMAIL',
  CONTACT_FORM = 'CONTACT_FORM',
  OTHER = 'OTHER',
}

export class UpdateImagePermissionDto {
  @IsEnum(ImagePermissionStatusDto)
  status!: ImagePermissionStatusDto;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  grantedByName?: string;

  @IsOptional()
  @IsDateString()
  grantedAt?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  conditions?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  emailContent?: string;
}

export class CreateCommunicationDto {
  @IsDateString()
  sentAt!: string;

  @IsEnum(ContactChannelDto)
  channel!: ContactChannelDto;

  @IsString()
  @MaxLength(300)
  subject!: string;

  @IsOptional()
  @IsBoolean()
  responded?: boolean;
}

export class UpdateCommunicationDto {
  @IsBoolean()
  responded!: boolean;
}
