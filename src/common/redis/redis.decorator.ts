import { Inject } from '@nestjs/common';

export const REDIS_CLIENT = 'REDIS_CLIENT';

/** Injects the shared ioredis client provided by RedisModule. */
export const InjectRedis = () => Inject(REDIS_CLIENT);
