import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Extends ThrottlerGuard to skip rate-limiting when NODE_ENV=test.
 * This allows e2e tests to call endpoints repeatedly without hitting throttle limits.
 */
@Injectable()
export class ThrottlerSkipTestGuard extends ThrottlerGuard {
  override async canActivate(context: ExecutionContext): Promise<boolean> {
    if (process.env.NODE_ENV === 'test') return true;
    return super.canActivate(context);
  }
}
