import { ForbiddenException, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY, ROLES_KEY } from '../decorators/auth.decorators';
import { RolesGuard } from './roles.guard';

function makeContext(user: unknown): ExecutionContext {
  return {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({ user }), getResponse: () => ({}) }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: { getAllAndOverride: jest.Mock };

  const configure = (opts: { isPublic?: boolean; roles?: string[] | undefined }) => {
    reflector.getAllAndOverride.mockImplementation((key: string) =>
      key === IS_PUBLIC_KEY ? opts.isPublic : opts.roles,
    );
  };

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() };
    guard = new RolesGuard(reflector as unknown as Reflector);
  });

  it('allows any request to a @Public() route', () => {
    configure({ isPublic: true });
    expect(guard.canActivate(makeContext(undefined))).toBe(true);
  });

  it('allows the request when no @Roles() metadata is set', () => {
    configure({ roles: undefined });
    expect(guard.canActivate(makeContext({ role: 'USER' }))).toBe(true);
  });

  it('allows a user whose role is in the required set', () => {
    configure({ roles: ['ADMIN', 'MODERATOR'] });
    expect(guard.canActivate(makeContext({ role: 'MODERATOR' }))).toBe(true);
  });

  it('throws ForbiddenException when the role is not permitted', () => {
    configure({ roles: ['ADMIN'] });
    expect(() => guard.canActivate(makeContext({ role: 'USER' }))).toThrow(ForbiddenException);
  });

  it('throws ForbiddenException when there is no authenticated user', () => {
    configure({ roles: ['ADMIN'] });
    expect(() => guard.canActivate(makeContext(undefined))).toThrow(ForbiddenException);
  });
});
