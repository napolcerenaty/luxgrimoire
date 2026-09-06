import { ForbiddenException } from '@nestjs/common';
import { assertOwnership } from './assert-ownership.util';

describe('assertOwnership', () => {
  it('is a no-op when the ids match', () => {
    expect(() => assertOwnership('u1', 'u1')).not.toThrow();
  });

  it('throws ForbiddenException when the resource belongs to someone else', () => {
    expect(() => assertOwnership('u1', 'u2')).toThrow(ForbiddenException);
  });
});
