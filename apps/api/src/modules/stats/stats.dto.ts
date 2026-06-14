import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateStatsSettingsDto {
  @IsOptional() @IsBoolean() spending?: boolean;
  @IsOptional() @IsBoolean() sales?: boolean;
  @IsOptional() @IsBoolean() reading?: boolean;
  @IsOptional() @IsBoolean() features?: boolean;
}
