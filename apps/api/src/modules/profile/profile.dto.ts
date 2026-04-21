import { IsString, IsOptional } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional() @IsString() bio?: string;
  @IsOptional() @IsString() avatar?: string;
  @IsOptional() @IsString() preferredCurrency?: string;
}

export class ChangeUsernameDto {
  @IsString() username!: string;
}
