import { randomBytes } from 'crypto';
import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * OAuth CSRF Protection via cookie-bound state parameter.
 *
 * Flow:
 *  Init guard  → generates a random nonce, stores it as a short-lived httpOnly cookie,
 *                and passes it as `state` to the OAuth provider's authorization URL.
 *  Callback guard → verifies that `?state` in the callback URL matches the stored cookie
 *                   before allowing Passport to exchange the authorization code for a token.
 *
 * This prevents login-CSRF attacks where an attacker initiates OAuth with their own account
 * and tricks a victim's browser into completing the flow (which would log the victim in as
 * the attacker).
 *
 * No session middleware required — the state lives entirely in a short-lived cookie.
 */

const STATE_COOKIE = 'oauth_state';
const STATE_COOKIE_MAX_AGE_SECONDS = 300; // 5 minutes

// ─── Google ────────────────────────────────────────────────────────────────────

@Injectable()
export class GoogleInitGuard extends AuthGuard('google') {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();

    const state = randomBytes(16).toString('hex');
    res.setCookie(STATE_COOKIE, state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: STATE_COOKIE_MAX_AGE_SECONDS,
      path: '/',
    });
    req._oauthState = state;

    return super.canActivate(context) as Promise<boolean>;
  }

  getAuthenticateOptions(context: ExecutionContext) {
    return { state: context.switchToHttp().getRequest()._oauthState };
  }
}

@Injectable()
export class GoogleCallbackGuard extends AuthGuard('google') {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    return verifyStateAndProceed(context, () => super.canActivate(context) as Promise<boolean>);
  }
}

// ─── Facebook ──────────────────────────────────────────────────────────────────

@Injectable()
export class FacebookInitGuard extends AuthGuard('facebook') {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();

    const state = randomBytes(16).toString('hex');
    res.setCookie(STATE_COOKIE, state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: STATE_COOKIE_MAX_AGE_SECONDS,
      path: '/',
    });
    req._oauthState = state;

    return super.canActivate(context) as Promise<boolean>;
  }

  getAuthenticateOptions(context: ExecutionContext) {
    return { state: context.switchToHttp().getRequest()._oauthState };
  }
}

@Injectable()
export class FacebookCallbackGuard extends AuthGuard('facebook') {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    return verifyStateAndProceed(context, () => super.canActivate(context) as Promise<boolean>);
  }
}

// ─── Discord ───────────────────────────────────────────────────────────────────

@Injectable()
export class DiscordInitGuard extends AuthGuard('discord') {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();

    const state = randomBytes(16).toString('hex');
    res.setCookie(STATE_COOKIE, state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: STATE_COOKIE_MAX_AGE_SECONDS,
      path: '/',
    });
    req._oauthState = state;

    return super.canActivate(context) as Promise<boolean>;
  }

  getAuthenticateOptions(context: ExecutionContext) {
    return { state: context.switchToHttp().getRequest()._oauthState };
  }
}

@Injectable()
export class DiscordCallbackGuard extends AuthGuard('discord') {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    return verifyStateAndProceed(context, () => super.canActivate(context) as Promise<boolean>);
  }
}

// ─── Shared callback state verification ────────────────────────────────────────

async function verifyStateAndProceed(
  context: ExecutionContext,
  proceed: () => Promise<boolean>,
): Promise<boolean> {
  const req = context.switchToHttp().getRequest();
  const res = context.switchToHttp().getResponse();
  const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';

  const providedState: string | undefined = req.query?.state;
  const storedState: string | undefined = req.cookies?.[STATE_COOKIE];

  if (!providedState || !storedState || providedState !== storedState) {
    res.redirect(`${frontendUrl}/login?error=oauth_state_mismatch`, 302);
    return false;
  }

  // State verified — clear the one-time-use cookie before proceeding
  res.clearCookie(STATE_COOKIE, { path: '/' });

  return proceed();
}
