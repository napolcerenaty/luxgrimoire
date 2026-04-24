import { IsString, IsDateString, IsOptional } from 'class-validator';

export class GetRateDto {
  @IsString()
  from!: string;

  @IsString()
  to!: string;

  @IsOptional()
  @IsDateString()
  date?: string;
}

export class PrefetchRatesDto {
  @IsString()
  from!: string;

  @IsString()
  to!: string;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;
}
