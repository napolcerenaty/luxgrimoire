import { ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Extends ThrottlerGuard to:
 * - Skip rate-limiting when NODE_ENV=test
 * - Fail-open: if Redis is unavailable, skip throttling instead of returning 500
 */
@Injectable()
export class ThrottlerSkipTestGuard extends ThrottlerGuard {
  private readonly logger = new Logger(ThrottlerSkipTestGuard.name);

  override async canActivate(context: ExecutionContext): Promise<boolean> {
    if (process.env.NODE_ENV === 'test') return true;
    try {
      return await super.canActivate(context);
    } catch (err: any) {
      // If Redis is unavailable (MISCONF, ECONNREFUSED, etc.), skip throttling
      // rather than returning 500 to the user.
      this.logger.warn(`Throttler storage error — skipping rate limit: ${err?.message ?? err}`);
      return true;
    }
  }
}
