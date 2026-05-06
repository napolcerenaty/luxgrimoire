import { IsString, IsOptional, IsNumber, Min, Max, Length, Matches } from 'class-validator';
import { Type } from 'class-transformer';

/** Instagram-style: letters, digits, underscores, periods; no leading/trailing/consecutive periods; 3–30 chars */
const USERNAME_REGEX = /^(?!\.)(?!.*\.\.)(?!.*\.$)[a-zA-Z0-9._]{3,30}$/;
const USERNAME_MSG =
  'Username must be 3–30 characters and may only contain letters, numbers, underscores and periods. It cannot start or end with a period, or contain consecutive periods.';

export class UpdateProfileDto {
  @IsOptional() @IsString() displayName?: string;
  @IsOptional() @IsString() bio?: string;
  @IsOptional() @IsString() avatar?: string;
  @IsOptional() @IsString() preferredCurrency?: string;
  @IsOptional() @IsString() timezone?: string;
  @IsOptional() @IsString() timeFormat?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(100) @Type(() => Number) defaultTaxRate?: number;
  @IsOptional() @IsString() @Length(2, 2) shippingCountry?: string;
}

export class ChangeUsernameDto {
  @IsString()
  @Matches(USERNAME_REGEX, { message: USERNAME_MSG })
  username!: string;
}
