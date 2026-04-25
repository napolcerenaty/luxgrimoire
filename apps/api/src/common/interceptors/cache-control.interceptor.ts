import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class CacheControlInterceptor implements NestInterceptor {
  constructor(private readonly directive: string = 'public, max-age=30, stale-while-revalidate=60') {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<{ method: string }>();
    if (req.method !== 'GET') return next.handle();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const reply = context.switchToHttp().getResponse<any>();
    return next.handle().pipe(
      tap(() => {
        reply.header('Cache-Control', this.directive);
        reply.header('Vary', 'Accept-Encoding');
      }),
    );
  }
}
