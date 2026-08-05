import { createParamDecorator, ExecutionContext, BadRequestException } from '@nestjs/common';

/**
 * Extracts the Idempotency-Key header. Required on every write endpoint that
 * could plausibly be retried by a flaky field connection (payment posting,
 * wallet allocation, claim registration).
 */
export const IdempotencyKey = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    const key = request.headers['idempotency-key'];
    if (!key || typeof key !== 'string') {
      throw new BadRequestException('Idempotency-Key header is required for this operation');
    }
    return key;
  },
);
