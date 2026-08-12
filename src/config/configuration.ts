export default () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  database: {
    // Managed platforms (Render, Railway, etc.) usually give a single
    // connection string instead of separate host/port/user/pass fields -
    // if DATABASE_URL is set, app.module.ts uses it directly and the
    // fields below are ignored.
    url: process.env.DATABASE_URL,
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    username: process.env.DB_USERNAME ?? 'emi_app',
    password: process.env.DB_PASSWORD ?? 'changeme',
    name: process.env.DB_NAME ?? 'emi_corehub',
  },
  redis: {
    // Same idea as DATABASE_URL above - Render/Railway's managed Redis
    // hands you a single REDIS_URL instead of separate host/port.
    url: process.env.REDIS_URL,
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
  },
  auth: {
    accessSecret: process.env.JWT_ACCESS_SECRET ?? 'dev-only-secret',
    accessExpiry: process.env.JWT_ACCESS_EXPIRY ?? '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET ?? 'dev-only-refresh-secret',
    refreshExpiry: process.env.JWT_REFRESH_EXPIRY ?? '7d',
  },
  businessRules: {
    premiumDueDay: parseInt(process.env.PREMIUM_DUE_DAY ?? '5', 10),
    warningThresholdMonths: parseInt(process.env.WARNING_THRESHOLD_MONTHS ?? '2', 10),
    lapseThresholdMonths: parseInt(process.env.LAPSE_THRESHOLD_MONTHS ?? '3', 10),
  },
  sms: {
    provider: process.env.SMS_PROVIDER ?? 'orange',
    apiKey: process.env.SMS_API_KEY ?? '',
    senderId: process.env.SMS_SENDER_ID ?? 'EMI',
  },
  email: {
    apiKey: process.env.EMAIL_API_KEY ?? '',
    fromAddress: process.env.EMAIL_FROM_ADDRESS ?? 'noreply@enhancedmutual.sl',
  },
  leadWebhookSecret: process.env.LEAD_WEBHOOK_SECRET ?? '',
  uploadDir: process.env.UPLOAD_DIR,
  portalJwtSecret: process.env.PORTAL_JWT_SECRET,
});
