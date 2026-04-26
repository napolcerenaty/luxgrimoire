import { IsOptional, IsString, IsUrl, MaxLength, MinLength } from 'class-validator';

export class CreateBugReportDto {
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title!: string;

  @IsString()
  @MinLength(5)
  @MaxLength(5000)
  description!: string;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(2048)
  pageUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  category?: string;
}
