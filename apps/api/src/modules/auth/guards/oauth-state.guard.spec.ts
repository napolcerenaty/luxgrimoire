import { ExecutionContext } from '@nestjs/common';
import { GoogleInitGuard, GoogleCallbackGuard } from './oauth-state.guard';

function makeContext(over: { req?: any; res?: any }): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => over.req ?? {},
      getResponse: () => over.res ?? {},
    }),
    getHandler: () => () => undefined,
    getClass: () => class {},
  } as unknown as ExecutionContext;
}

describe('GoogleInitGuard', () => {
  it('sets a short-lived state cookie and redirects to Google with a matching state param', () => {
    process.env.GOOGLE_CLIENT_ID = 'client-abc';
    process.env.OAUTH_CALLBACK_BASE_URL = 'https://api.lg.com';
    const res = { setCookie: jest.fn(), redirect: jest.fn() };

    const result = new GoogleInitGuard().canActivate(makeContext({ res }));

    expect(result).toBe(false); // response already handled

    const [cookieName, cookieValue, opts] = res.setCookie.mock.calls[0];
    expect(cookieName).toBe('oauth_state');
    expect(cookieValue).toMatch(/^[0-9a-f]{32}$/);
    expect(opts).toMatchObject({ httpOnly: true, sameSite: 'lax', maxAge: 300, path: '/' });

    const redirectUrl: string = res.redirect.mock.calls[0][0];
    expect(redirectUrl.startsWith('https://accounts.google.com/o/oauth2/v2/auth?')).toBe(true);
    expect(redirectUrl).toContain(`state=${cookieValue}`);
    expect(redirectUrl).toContain('client_id=client-abc');
    expect(redirectUrl).toContain('redirect_uri=https%3A%2F%2Fapi.lg.com%2Fapi%2Fauth%2Fgoogle%2Fcallback');
  });
});

describe('GoogleCallbackGuard state verification', () => {
  it('redirects to the login error page when the state param and cookie do not match', async () => {
    process.env.FRONTEND_URL = 'https://app.lg.com';
    const res = { redirect: jest.fn(), clearCookie: jest.fn() };
    const ctx = makeContext({ req: { query: { state: 'aaa' }, cookies: { oauth_state: 'bbb' } }, res });

    const result = await new GoogleCallbackGuard().canActivate(ctx);

    expect(result).toBe(false);
    expect(res.redirect).toHaveBeenCalledWith('https://app.lg.com/login?error=oauth_state_mismatch', 302);
    expect(res.clearCookie).not.toHaveBeenCalled();
  });

  it('redirects on a missing state entirely', async () => {
    process.env.FRONTEND_URL = 'https://app.lg.com';
    const res = { redirect: jest.fn(), clearCookie: jest.fn() };
    const ctx = makeContext({ req: { query: {}, cookies: {} }, res });

    const result = await new GoogleCallbackGuard().canActivate(ctx);

    expect(result).toBe(false);
    expect(res.redirect).toHaveBeenCalledWith('https://app.lg.com/login?error=oauth_state_mismatch', 302);
  });

  it('clears the one-time cookie and proceeds to passport when the state matches', async () => {
    const res = { redirect: jest.fn(), clearCookie: jest.fn() };
    const ctx = makeContext({ req: { query: { state: 'match' }, cookies: { oauth_state: 'match' } }, res });

    // super.canActivate() will fail without a registered passport strategy — that's fine,
    // we only need to prove state verification passed and the cookie was cleared first.
    await new GoogleCallbackGuard().canActivate(ctx).catch(() => undefined);

    expect(res.clearCookie).toHaveBeenCalledWith('oauth_state', { path: '/' });
    expect(res.redirect).not.toHaveBeenCalled();
  });
});
