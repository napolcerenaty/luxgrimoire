import { IsEmail, IsString, MinLength, MaxLength, IsBoolean, Equals, IsNotEmpty, IsOptional, Matches } from 'class-validator';

/** bcrypt silently truncates inputs at 72 bytes — cap passwords there to prevent DoS via long inputs */
const BCRYPT_MAX = 72;

/** Instagram-style: letters, digits, underscores, periods; no leading/trailing/consecutive periods; 3–30 chars */
const USERNAME_REGEX = /^(?!\.)(?!.*\.\.)(?!.*\.$)[a-zA-Z0-9._]{3,30}$/;
const USERNAME_MSG =
  'Username must be 3–30 characters and may only contain letters, numbers, underscores and periods. It cannot start or end with a period, or contain consecutive periods.';

/** Strong password: min 8, max 72, must have uppercase, lowercase, digit and special character */
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z0-9]).{8,72}$/;
const PASSWORD_MSG =
  'Password must be 8–72 characters and include at least one uppercase letter, one lowercase letter, one number and one special character.';

export class RegisterDto {
  @IsString()
  @Matches(USERNAME_REGEX, { message: USERNAME_MSG })
  username!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @Matches(PASSWORD_REGEX, { message: PASSWORD_MSG })
  password!: string;

  @IsBoolean()
  @Equals(true, { message: 'You must accept the Terms of Service and Privacy Policy to register.' })
  termsAccepted!: boolean;

  @IsString()
  termsVersion!: string;

  @IsString()
  privacyVersion!: string;
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
  @Matches(PASSWORD_REGEX, { message: PASSWORD_MSG })
  password!: string;
}

export class ChangePasswordDto {
  @IsString()
  @MaxLength(BCRYPT_MAX)
  currentPassword!: string;

  @IsString()
  @Matches(PASSWORD_REGEX, { message: PASSWORD_MSG })
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

/** Only the doc(s) actually outdated for this user are sent — see AuthService.saveConsent */
export class ConsentDto {
  @IsOptional()
  @IsString()
  termsVersion?: string;

  @IsOptional()
  @IsString()
  privacyVersion?: string;
}
