import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.decorator';
import { buildRedisConnectionOptions } from './redis-connection.util';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new Redis(
          buildRedisConnectionOptions(
            config.get<string>('redis.url'),
            config.get<string>('redis.host'),
            config.get<number>('redis.port'),
          ),
        ),
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
