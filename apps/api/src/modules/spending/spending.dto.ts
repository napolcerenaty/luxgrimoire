import { IsString, IsOptional, IsNumber, IsDateString } from 'class-validator';

export class AddTransactionDto {
  @IsOptional() @IsString() bookEditionId?: string;
  @IsOptional() @IsString() subscriptionMonthId?: string;
  @IsNumber() amount!: number;
  @IsString() currency!: string;
  @IsDateString() purchasedAt!: string;
  @IsOptional() @IsString() platform?: string;
  @IsOptional() @IsString() notes?: string;
}

export class UpdateTransactionDto {
  @IsOptional() @IsNumber() amount?: number;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsDateString() purchasedAt?: string;
  @IsOptional() @IsString() platform?: string;
  @IsOptional() @IsString() notes?: string;
}
