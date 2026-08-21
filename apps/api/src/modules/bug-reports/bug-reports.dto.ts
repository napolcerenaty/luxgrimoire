import { IsEmail, IsOptional, IsString, IsUrl, MaxLength, MinLength } from 'class-validator';

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
  @IsUrl({ require_protocol: true, require_tld: false })
  @MaxLength(2048)
  pageUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  category?: string;

  /** Set by the Contact Us page only — triggers an email to the contact inbox (replyTo this address). */
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  contactEmail?: string;
}
