import { IsEmail, IsString, MinLength, MaxLength, IsBoolean, Equals, IsNotEmpty } from 'class-validator';

/** bcrypt silently truncates inputs at 72 bytes — cap passwords there to prevent DoS via long inputs */
const BCRYPT_MAX = 72;

export class RegisterDto {
  @IsString()
  @MinLength(3)
  @MaxLength(30)
  username!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(BCRYPT_MAX)
  password!: string;

  @IsBoolean()
  @Equals(true, { message: 'You must accept the Terms of Service and Privacy Policy to register.' })
  termsAccepted!: boolean;
}

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MaxLength(BCRYPT_MAX)
  password!: string;
}

export class ForgotPasswordDto {
  @IsEmail()
  email!: string;
}

export class ResetPasswordDto {
  @IsString()
  token!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(BCRYPT_MAX)
  password!: string;
}

export class ChangePasswordDto {
  @IsString()
  @MaxLength(BCRYPT_MAX)
  currentPassword!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(BCRYPT_MAX)
  newPassword!: string;
}

export class VerifyEmailDto {
  @IsString()
  @IsNotEmpty()
  token!: string;
}

export class ResendVerificationDto {
  @IsEmail()
  email!: string;
}
