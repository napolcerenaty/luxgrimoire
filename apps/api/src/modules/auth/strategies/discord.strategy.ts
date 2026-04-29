// eslint-disable-next-line @typescript-eslint/no-require-imports
const DiscordOAuth = require('passport-discord');
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';

@Injectable()
export class DiscordStrategy extends PassportStrategy(DiscordOAuth.Strategy, 'discord') {
  constructor() {
    super({
      clientID: process.env.DISCORD_CLIENT_ID ?? 'not-configured',
      clientSecret: process.env.DISCORD_CLIENT_SECRET ?? 'not-configured',
      callbackURL: `${process.env.OAUTH_CALLBACK_BASE_URL ?? 'http://localhost:3001'}/api/auth/discord/callback`,
      scope: ['identify', 'email'],
    });
  }

  async validate(accessToken: string, refreshToken: string, profile: any, done: Function) {
    const email = profile.email ?? null;
    const avatarUrl = profile.avatar
      ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png`
      : null;
    const displayName = profile.global_name ?? profile.username ?? null;
    done(null, { provider: 'discord', providerId: profile.id, email, displayName, avatarUrl, accessToken, refreshToken });
  }
}
