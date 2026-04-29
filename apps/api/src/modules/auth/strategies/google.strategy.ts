import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback, Profile } from 'passport-google-oauth20';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor() {
    super({
      clientID: process.env.GOOGLE_CLIENT_ID ?? 'not-configured',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? 'not-configured',
      callbackURL: `${process.env.OAUTH_CALLBACK_BASE_URL ?? 'http://localhost:3001'}/api/auth/google/callback`,
      scope: ['email', 'profile'],
    });
  }

  async validate(accessToken: string, refreshToken: string, profile: Profile, done: VerifyCallback) {
    const email = profile.emails?.[0]?.value ?? null;
    const avatarUrl = profile.photos?.[0]?.value ?? null;
    const displayName = profile.displayName ?? null;
    done(null, { provider: 'google', providerId: profile.id, email, displayName, avatarUrl, accessToken, refreshToken });
  }
}
