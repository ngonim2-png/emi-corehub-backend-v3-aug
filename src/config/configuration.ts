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
    // AG payroll deductions for a month arrive by this day of the next month.
    payrollReceiptDay: parseInt(process.env.PAYROLL_RECEIPT_DAY ?? '10', 10),
  },
  finance: {
    // Chart-of-accounts code used to carry AG payroll premiums between the month earned and the month received.
    payrollReceivableAccount: process.env.PAYROLL_RECEIVABLE_ACCOUNT ?? '1100',
    // Accounts used for client loans.
    loanReceivableAccount: process.env.LOAN_RECEIVABLE_ACCOUNT ?? '1400',
    loanUnearnedInterestAccount: process.env.LOAN_UNEARNED_INTEREST_ACCOUNT ?? '2500',
    loanInterestIncomeAccount: process.env.LOAN_INTEREST_INCOME_ACCOUNT ?? '4200',
    loanPayoutAccount: process.env.LOAN_PAYOUT_ACCOUNT ?? '1010',
  },
  loans: {
    // Flat interest on the amount borrowed, whatever the tenure.
    interestRatePct: parseFloat(process.env.LOAN_INTEREST_RATE_PCT ?? '25'),
    // Tenures a client can choose, in months (the paper form offers 6 or 12).
    tenureOptions: (process.env.LOAN_TENURE_OPTIONS ?? '6,12').split(',').map((v) => parseInt(v.trim(), 10)).filter((n) => n > 0 && n <= 60),
    // Distinct months of premium that must be on record before a loan request is accepted.
    minMonthsPaid: parseInt(process.env.LOAN_MIN_MONTHS_PAID ?? '3', 10),
    // Debt-to-income above this is flagged on the assessment (not blocked).
    maxDtiPct: parseFloat(process.env.LOAN_MAX_DTI_PCT ?? '40'),
    // Every checklist document must be ticked before the Finance Director can approve.
    requireChecklist: (process.env.LOAN_REQUIRE_CHECKLIST ?? 'true').toLowerCase() !== 'false',
  },
  sms: {
    provider: process.env.SMS_PROVIDER ?? 'alemobet',
    apiKey: process.env.SMS_API_KEY ?? '',
    senderId: process.env.SMS_SENDER_ID ?? 'EMI',
    /** Event-driven SMS (payment receipts, claim status updates) is gated behind this - off by default, deliberately, so nothing sends automatically until this is explicitly turned on. Manual/triggered sending (single messages, bulk campaigns) is never affected by this flag. */
    automaticEnabled: (process.env.SMS_AUTOMATIC_ENABLED ?? 'false').toLowerCase() === 'true',
    alemobetServer: process.env.ALEMOBET_SERVER ?? '',
    alemobetPort: Number(process.env.ALEMOBET_PORT ?? '8080'),
    alemobetUsername: process.env.ALEMOBET_USERNAME ?? '',
    alemobetPassword: process.env.ALEMOBET_PASSWORD ?? '',
  },
  email: {
    apiKey: process.env.EMAIL_API_KEY ?? '',
    fromAddress: process.env.EMAIL_FROM_ADDRESS ?? 'noreply@enhancedmutual.sl',
  },
  leadWebhookSecret: process.env.LEAD_WEBHOOK_SECRET ?? '',
  uploadDir: process.env.UPLOAD_DIR,
  portalJwtSecret: process.env.PORTAL_JWT_SECRET,
  clientApp: {
    officePhone: process.env.APP_OFFICE_PHONE ?? '',
    officeWhatsapp: process.env.APP_OFFICE_WHATSAPP ?? '',
    officeAddress: process.env.APP_OFFICE_ADDRESS ?? '',
    vapidPublicKey: process.env.VAPID_PUBLIC_KEY ?? '',
    vapidPrivateKey: process.env.VAPID_PRIVATE_KEY ?? '',
    vapidSubject: process.env.VAPID_SUBJECT ?? 'mailto:admin@enhancedmutual.sl',
  },
});
