import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import {
  RegisterDto,
  LoginDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  ChangePasswordDto,
  VerifyEmailDto,
  ResendVerificationDto,
} from './auth.dto';
import { Public } from '../../common/decorators/auth.decorators';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  GoogleInitGuard,
  GoogleCallbackGuard,
  DiscordInitGuard,
  DiscordCallbackGuard,
} from './guards/oauth-state.guard';

@ApiTags('auth')
@UseGuards(JwtAuthGuard)
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('login')
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: any) {
    const { accessToken, ...user } = await this.authService.login(dto);
    this.setAuthCookie(res, accessToken);
    return user; // return user object only, not token
  }

  @ApiBearerAuth()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@CurrentUser() user: { id: string; jti: string | null }, @Res({ passthrough: true }) res: any) {
    this.clearAuthCookie(res);
    if (user.jti) return this.authService.logout(user.id, user.jti);
  }

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @ApiBearerAuth()
  @Post('change-password')
  changePassword(
    @CurrentUser() user: { id: string },
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(user.id, dto);
  }

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('verify-email')
  async verifyEmail(@Body() dto: VerifyEmailDto, @Res({ passthrough: true }) res: any) {
    const result = await this.authService.verifyEmail(dto.token);
    if (result?.accessToken) {
      this.setAuthCookie(res, result.accessToken);
      const { accessToken: _, ...user } = result;
      return user;
    }
    return result;
  }

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  @Post('resend-verification')
  resendVerification(@Body() dto: ResendVerificationDto) {
    return this.authService.resendVerification(dto.email);
  }

  @ApiBearerAuth()
  @Get('me')
  getMe(@CurrentUser() user: { id: string }) {
    return this.authService.getMe(user.id);
  }

  @Post('consent')
  saveConsent(@CurrentUser() user: { id: string }) {
    return this.authService.saveConsent(user.id);
  }

  // ——— Google OAuth ———
  @Public()
  @Get('google')
  @UseGuards(GoogleInitGuard)
  googleLogin() { /* Passport redirects automatically */ }

  @Public()
  @Get('google/callback')
  @UseGuards(GoogleCallbackGuard)
  async googleCallback(@Req() req: any, @Res() res: any) {
    return this.handleOAuthCallback(req, res);
  }

  // ——— Discord OAuth ———
  @Public()
  @Get('discord')
  @UseGuards(DiscordInitGuard)
  discordLogin() {}

  @Public()
  @Get('discord/callback')
  @UseGuards(DiscordCallbackGuard)
  async discordCallback(@Req() req: any, @Res() res: any) {
    return this.handleOAuthCallback(req, res);
  }

  private async handleOAuthCallback(req: any, res: any) {
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
    try {
      const result = await this.authService.oauthCallback(req.user);
      this.setAuthCookie(res, result.accessToken);
      return res.redirect(`${frontendUrl}/auth/callback`, 302); // NO token in URL
    } catch {
      return res.redirect(`${frontendUrl}/login?error=oauth_failed`, 302);
    }
  }

  private setAuthCookie(res: any, token: string) {
    const isProd = process.env.NODE_ENV === 'production';
    const cookieName = process.env.JWT_COOKIE_NAME ?? 'jwt';
    const maxAge = 7 * 24 * 60 * 60; // 7 days in seconds
    res.setCookie(cookieName, token, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      path: '/',
      maxAge,
    });
  }

  private clearAuthCookie(res: any) {
    const cookieName = process.env.JWT_COOKIE_NAME ?? 'jwt';
    res.clearCookie(cookieName, { path: '/' });
  }
}
