import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, Profile } from 'passport-facebook';

@Injectable()
export class FacebookStrategy extends PassportStrategy(Strategy, 'facebook') {
  constructor() {
    super({
      clientID: process.env.FACEBOOK_CLIENT_ID ?? 'not-configured',
      clientSecret: process.env.FACEBOOK_CLIENT_SECRET ?? 'not-configured',
      callbackURL: `${process.env.OAUTH_CALLBACK_BASE_URL ?? 'http://localhost:3001'}/api/auth/facebook/callback`,
      scope: ['email', 'public_profile'],
      profileFields: ['id', 'displayName', 'emails', 'photos'],
    });
  }

  async validate(accessToken: string, refreshToken: string | undefined, profile: Profile, done: Function) {
    const email = profile.emails?.[0]?.value ?? null;
    const avatarUrl = profile.photos?.[0]?.value ?? null;
    const displayName = profile.displayName ?? null;
    done(null, { provider: 'facebook', providerId: profile.id, email, displayName, avatarUrl, accessToken, refreshToken: refreshToken ?? null });
  }
}
