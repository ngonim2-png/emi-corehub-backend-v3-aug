import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import Redis from 'ioredis';
import { InjectRedis } from '../redis/redis.decorator';

const IDEMPOTENCY_TTL_SECONDS = 60 * 60 * 24; // 24 hours

/**
 * Applies to any POST/PATCH route that takes an Idempotency-Key header
 * (see IdempotencyKey param decorator). If the same key was already
 * processed, the cached response is replayed instead of re-running the
 * handler - this is what makes retries from the marketer PWA's offline
 * queue safe.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(@InjectRedis() private readonly redis: Redis) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const request = context.switchToHttp().getRequest();
    const key = request.headers['idempotency-key'];
    if (!key) return next.handle();

    const cacheKey = `idempotency:${request.route?.path}:${key}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return of(JSON.parse(cached));
    }

    return next.handle().pipe(
      tap(async (response) => {
        await this.redis.set(
          cacheKey,
          JSON.stringify(response),
          'EX',
          IDEMPOTENCY_TTL_SECONDS,
        );
      }),
    );
  }
}
