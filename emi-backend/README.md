# EMI CoreHub — Backend

Enhanced Mutual Insurance (SL) Ltd core insurance system. NestJS + PostgreSQL + Redis/BullMQ.

This scaffold has been fully built, compiled, and verified end-to-end against a real
PostgreSQL database and Redis instance (not mocked) — see "What's been verified" below.

**Deploying this so real staff can use it?** See [`DEPLOYMENT.md`](./DEPLOYMENT.md) —
managed-platform and self-hosted paths, with the `Dockerfile` / `docker-compose.prod.yml`
/ `Caddyfile` in this repo ready to use for the self-hosted route.

## Connected frontend

`EMI_CoreHub_Connected.html` (separate download) is a browser-based frontend that
talks to this API directly over `fetch` — no `window.storage`, no mock data. Run
`npm run seed` first (below), start the backend with `npm run start:dev`, then open
that HTML file in a browser and log in with `admin@emi.sl` / `password123`. The
JWT is held in memory only for the tab's session (no localStorage), and the API base
URL is editable on the login screen if you're running the backend somewhere other
than `http://localhost:3000`.

The frontend was verified against a real running instance of this backend in
development, including: login (with the MFA branch), registering a client and
policy, posting a payment and watching it appear in the wallet/journal/dashboard,
and viewing the real IFRS 17 GMM measurement produced by the batch job.

Several endpoints were added specifically to support the frontend and are also
generally useful: `GET /products`, `POST /products`, `GET /directory/marketers`
(narrow marketer lookup, no admin gate), `GET /users`, `GET /roles`,
`GET /payments` (recent, cross-policy), `GET /claims` (all), `GET /accounts`,
`GET /journal-entries` (list), `GET /notifications/sms-logs`,
`GET /settings/business-rules`, `GET /ifrs17/groups`, `GET /ifrs17/measurements`,
and the important one — `GET /policies/reports/computed`, which runs the same
`policy-status.util.ts` the nightly job uses, live, against real payment data.

## Seeding a fresh database

```bash
npm run seed
```

Idempotent — safe to re-run. Creates the 8 standard roles, four demo logins (Super
Admin, Finance Manager, two Marketer/Agent accounts, all password `password123`),
the product catalogue, and the chart of accounts. Without this, a fresh database has
no roles or users and nobody can log in.

## Quick start

```bash
npm install
cp .env.example .env          # edit DB/Redis credentials if not using docker-compose
docker-compose up -d          # starts Postgres 16 + Redis 7 locally
npm run start:dev             # synchronize:true in development auto-creates the schema
npm run seed                  # populate roles/users/products/accounts
```

The API listens on `http://localhost:3000/api/v1`.

## Folder structure

```
src/
  main.ts                     Bootstrap: Helmet, global ValidationPipe, exception filter
  app.module.ts                Root wiring: every feature module + global guards/interceptors
  config/configuration.ts      Typed env config

  common/                      Cross-cutting concerns, imported by every module
    decorators/                 @Roles, @CurrentUser, @Public, @IdempotencyKey, @AuditLog
    guards/                     JwtAuthGuard, RolesGuard
    interceptors/                AuditLogInterceptor, IdempotencyInterceptor
    filters/                    Global HTTP exception filter
    utils/                       Money (integer-minor-unit arithmetic), password hashing,
                                 decimal column transformer
    redis/                      Shared ioredis provider
    events/domain-events.ts      Internal event-bus contract between modules

  modules/
    audit/                      Append-only audit_logs — the only write path into it
    identity-access/            Users, roles, permissions, devices, JWT + MFA auth
    clients-policies/           Clients, policies, products, beneficiaries
                                 + policy-status.util.ts: the authoritative lapse/warning
                                   calculation, ported faithfully from the prototype
    field-collection-wallet/    Payments + marketer wallets
                                 — wallet balance is always computed from an immutable
                                   ledger (wallet_transactions), never stored as a
                                   mutable number
    underwriting/                Proposal queue and decisions
    claims/                     Registered -> Under Review -> Approved -> Paid workflow
    finance-ifrs17/             Chart of accounts, double-entry journal (rejects
                                 unbalanced entries), IFRS 17 measurement snapshots
                                 + actuarial/: real PAA and GMM calculators (see below)
    notifications/               SMS adapter interface + Orange stub, BullMQ worker,
                                 event listener (payment/claim -> SMS)
    crm/                         Leads, complaints
    marketing-sales/             Marketer targets
    hr/                          Employees, leave requests
    administration/              Assets, procurement
    documents/                    Document metadata registry (pre-signed-upload pattern)
    reporting-ai/                Dashboard aggregation + AI assistant (calls the
                                 Anthropic API directly, given only a bounded summary)

  jobs/                         Background processors (BullMQ), registered as cron
                                 repeatables by scheduler.service.ts:
    lapse-detection.processor.ts       nightly - recomputes every policy's status
    wallet-reconciliation.processor.ts nightly - flags stale uncleared cash
    token-expiry.processor.ts          nightly - stub, freeze rules are a product decision
    ifrs17-batch-close.processor.ts    monthly - runs the real PAA/GMM roll-forward
                                        (see "The IFRS 17 engine" below), aggregates
                                        actual premiums/claims per group, writes an
                                        immutable per-period snapshot
```

## The IFRS 17 engine

`src/modules/finance-ifrs17/actuarial/` is a real, tested calculation engine, not a
placeholder:

- **`paa-calculator.ts`** — Premium Allocation Approach, for short-duration products
  (Credit Life, Personal Accident). Straight-line LRC release over the coverage
  period, LIC (incurred-but-unpaid claims) accreting interest, risk adjustment as a
  configurable margin on the best estimate.
- **`gmm-calculator.ts`** — General Measurement Model, for long-duration products
  (Super Savings, Endowment, Retirement Plan, Group Life). Full CSM roll-forward:
  interest accretion at the **locked-in** discount rate (not current), the
  future-service "unlock" adjustment, CSM release in proportion to coverage units
  delivered, and correct onerous-contract handling — CSM floors at exactly zero and
  the shortfall is recognised as an immediate loss, per IFRS 17.48-49.
- **`ifrs17-types.ts`** — shared types and the annual-to-period rate conversion.

`ifrs17-batch-close.processor.ts` is the orchestration layer: for each
`ifrs17_groups` row (one per product × cohort year), it aggregates that group's
actual premiums received and claims incurred/paid for the period directly from the
`payments` and `claims` tables, pulls the prior period's closing balances as this
period's opening balances (or the actuary-provided `initialFcf`/`initialRiskAdjustment`
for a group's very first period), and calls the matching calculator.

**Verified, not just written:**
- 17 unit tests in `actuarial/__tests__/calculators.test.ts` check the arithmetic
  against hand-calculated values, including the two invariants that matter most:
  `closingLrc = closingFcf + closingRiskAdjustment + closingCsm` always holds, and an
  adverse assumption change larger than the available CSM correctly floors CSM at
  zero and recognises exactly the shortfall as a loss. Run with:
  `npx ts-node --compiler-options '{"module":"commonjs"}' src/modules/finance-ifrs17/actuarial/__tests__/calculators.test.ts`
- Beyond the isolated unit tests, this was run **live**: a real GMM group was seeded
  for the Super Savings product, a real payment and two real claims were posted
  through the actual API, the batch-close job was enqueued on the real BullMQ queue,
  the real worker picked it up, and the persisted `ifrs17_measurements` row's
  `insuranceRevenue` matched `insuranceServiceExpense + riskAdjustmentRelease +
  csmRecognisedInPnl` to the cent, with `insuranceServiceExpense` matching the exact
  sum of the two claims' amounts pulled from the live `claims` table.

**What still requires an actuary, clearly marked in code with `// TODO`:**
- The risk adjustment is a flat percentage margin (`riskAdjustmentMarginPct`), a
  placeholder for a real cost-of-capital or confidence-level calibration.
- `initialFcf` / `initialRiskAdjustment` per GMM group, and `gmmCoverageUnitsTotal`,
  must be actuary-provided — the engine refuses to close a group's first period
  without them rather than silently defaulting to zero.
- Claims are aggregated by `dateReported` falling in the period; a real system needs
  a separate `paidDate` column to distinguish "incurred" from "paid" timing correctly.
- `expectedClaimsAndExpensesInPeriod` currently uses actual incurred claims as a
  proxy; a real actuarial model would supply the best-estimate expected cash flow
  for the period independently of what actually happened.
- The discount rate is a single flat annual rate per group, not a full yield curve.

## Design decisions worth knowing before you extend this

- **Money is never a float.** Entities store `NUMERIC(18,2)` as strings; the `Money`
  class in `common/utils/money.util.ts` does all arithmetic in integer minor units.
- **A wallet's balance is computed, not stored.** See `WalletsService.getBalance()` —
  it's a `SUM()` over `wallet_transactions`, the same way a bank statement works. This
  is what makes tampering detectable instead of just trusting a number.
- **Payments and their wallet debit are one database transaction.** See
  `PaymentsService.postPayment()`. The domain event that triggers the SMS receipt and
  the finance journal entry only fires after that transaction commits.
- **Approval-gated actions write their audit row in the same transaction as the
  mutation**, not via the generic interceptor — see `PoliciesService.editPolicyNumber()`
  and `WalletsService.allocate()` for the pattern.
- **The IFRS 17 engine's mechanics are real and tested**, but several of its inputs
  are still placeholders pending actuarial sign-off — see "What still requires an
  actuary" above, not a general "not finished" disclaimer.

## What's been verified

This scaffold was built and tested against real infrastructure, not just compiled:

- `npx tsc --noEmit` and `npx nest build` — clean, zero errors
- Full Nest DI graph instantiated successfully against a real PostgreSQL 16 + Redis 7
- `synchronize: true` created all 29 tables from the entities with no schema errors
- Live HTTP smoke test through the running server:
  - Login issues a real JWT; wrong role gets a real 403 with the exact roles required
  - Client -> Policy -> Payment created end-to-end through the actual API
  - Posting the same payment twice with the same `Idempotency-Key` returned the
    identical payment record both times — confirmed only one row exists in `payments`
  - The payment automatically: debited the marketer's wallet ledger, queued and sent
    (via BullMQ) a templated SMS receipt, and posted a balanced double-entry journal
    entry (`Dr 2300 Marketer Token Wallet Liability / Cr 4000 Insurance Revenue`)
  - Advancing a claim to `Approved` posted its own balanced journal entry
    (`Dr 5100 Claims Expense / Cr 2100 Claims Payable`)
  - The audit log correctly recorded every action in order, readable only by
    Super Admin / Internal Auditor roles
  - A real GMM group's batch-close ran on the live BullMQ queue and produced a
    measurement row satisfying its own accounting identities to the cent — see
    "The IFRS 17 engine" above for the full detail

## Not yet done (intentionally out of scope for a scaffold)

- A real SMS provider connection. Individual sends (payment receipts, claim
  status updates) and bulk campaigns (Administration → SMS & Notifications →
  Send bulk SMS, targeting clients by district/status, all marketers, or a
  custom phone list) are both fully built and tested end-to-end - queuing,
  audience resolution, per-recipient delivery tracking, and campaign-level
  status all work correctly today against a simulated gateway. Wiring in a
  real provider (Orange, Africa's Talking, Twilio, etc.) is a change entirely
  inside `src/modules/notifications/adapters/orange-sms.adapter.ts` - see the
  `sendBulk()` method's docstring for exactly what to replace. Nothing outside
  that one file needs to change; `SmsGatewayAdapter` is the only contract the
  rest of the system depends on.
- Real S3/MinIO client for the documents module's pre-signed upload URLs
- Rate-limit tuning, refresh-token rotation storage, penetration testing — see the
  backend architecture doc's security section

Migrations and backup/restore are handled — see `src/migrations/`,
`scripts/backup.sh`, `scripts/restore.sh`, and `DEPLOYMENT.md`.
