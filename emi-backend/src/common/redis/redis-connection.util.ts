/**
 * Returns plain ioredis connection options (host/port/username/password),
 * regardless of whether the source was a single REDIS_URL (Render,
 * Railway, and most managed platforms) or separate REDIS_HOST/REDIS_PORT
 * (self-hosted Docker Compose). Deliberately does NOT construct or return
 * a live ioredis instance or hand a raw URL string to a caller - every
 * caller in this app has only ever been tested against a plain options
 * object, so this keeps that exact shape instead of introducing an
 * untested code path.
 */
export function buildRedisConnectionOptions(redisUrl: string | undefined, host: string | undefined, port: number | undefined) {
  if (!redisUrl) {
    return { host: host ?? 'localhost', port: port ?? 6379 };
  }
  const parsed = new URL(redisUrl);
  return {
    host: parsed.hostname,
    port: parsed.port ? parseInt(parsed.port, 10) : 6379,
    username: parsed.username || undefined,
    password: parsed.password || undefined,
    tls: parsed.protocol === 'rediss:' ? {} : undefined,
  };
}
