import { OptionalJwtGuard } from './optional-jwt.guard';

describe('OptionalJwtGuard.handleRequest', () => {
  const guard = new OptionalJwtGuard();

  it('returns the authenticated user when present', () => {
    const user = { id: 'u1' };
    expect(guard.handleRequest(null, user)).toBe(user);
  });

  it('returns null instead of throwing when there is no user', () => {
    expect(guard.handleRequest(null, undefined)).toBeNull();
  });

  it('still returns null (never throws) even when passport reports an error', () => {
    expect(guard.handleRequest(new Error('jwt expired'), undefined)).toBeNull();
  });
});
