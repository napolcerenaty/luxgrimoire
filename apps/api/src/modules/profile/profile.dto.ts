import { IsString, IsOptional, IsNumber, Min, Max, Length } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateProfileDto {
  @IsOptional() @IsString() bio?: string;
  @IsOptional() @IsString() avatar?: string;
  @IsOptional() @IsString() preferredCurrency?: string;
  @IsOptional() @IsString() timezone?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(100) @Type(() => Number) defaultTaxRate?: number;
  @IsOptional() @IsString() @Length(2, 2) shippingCountry?: string;
}

export class ChangeUsernameDto {
  @IsString() username!: string;
}
