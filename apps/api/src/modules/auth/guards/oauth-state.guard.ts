import { randomBytes } from 'crypto';
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * OAuth CSRF Protection via cookie-bound state parameter.
 *
 * Flow:
 *  Init guard  → generates a random nonce, stores it as a short-lived httpOnly cookie,
 *                then manually redirects to the provider's authorization URL (avoids
 *                Passport's Express-only res.setHeader/res.end which break on Fastify).
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

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';

// ─── Google ────────────────────────────────────────────────────────────────────

/**
 * Manually builds the Google OAuth2 authorization URL and redirects via Fastify's
 * reply.redirect(). Passport's built-in redirect uses res.setHeader + res.end (Express API)
 * which are not available on Fastify's Reply object, causing a 500.
 */
@Injectable()
export class GoogleInitGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const res = context.switchToHttp().getResponse();

    const state = randomBytes(16).toString('hex');
    res.setCookie(STATE_COOKIE, state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: STATE_COOKIE_MAX_AGE_SECONDS,
      path: '/',
    });

    const callbackUrl = `${process.env.OAUTH_CALLBACK_BASE_URL ?? 'http://localhost:3001'}/api/auth/google/callback`;
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: process.env.GOOGLE_CLIENT_ID ?? 'not-configured',
      redirect_uri: callbackUrl,
      scope: 'email profile',
      state,
      access_type: 'offline',
    });

    res.redirect(`${GOOGLE_AUTH_URL}?${params.toString()}`, 302);
    return false; // response already handled — NestJS must not process further
  }
}

@Injectable()
export class GoogleCallbackGuard extends AuthGuard('google') {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    return verifyStateAndProceed(context, () => super.canActivate(context) as Promise<boolean>);
  }
}

// ─── Facebook ──────────────────────────────────────────────────────────────────
// Facebook OAuth removed

// ─── Discord ───────────────────────────────────────────────────────────────────
// Discord OAuth removed

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
