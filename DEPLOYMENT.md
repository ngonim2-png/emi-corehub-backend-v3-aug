# Deploying EMI CoreHub so staff can reach it nationwide

Three things need to be true before an employee in, say, Bo or Makeni can use this
from their phone or laptop:

1. The backend API and database are running somewhere with a public IP address.
2. There's a real domain name pointing at it, with HTTPS (not just an IP — no
   modern browser will let you type a password into a plain-HTTP page, and you
   don't want client data on an unencrypted connection anyway).
3. The frontend HTML file's "API base URL" points at that domain instead of
   `localhost:3000`.

None of this requires infrastructure inside Sierra Leone. Once it's on the public
internet with HTTPS, anyone with a data bundle or an office ISP connection can
reach it — the same way any website works. What actually matters for staff
experience is **latency to whichever region you host in**, not physical proximity,
because most Sierra Leonean internet traffic already routes through international
cables to Europe. Test both a European region (London/Frankfurt) and Cape Town
before committing — don't assume "closer on a map" means "faster."

---

## Two ways to do this — pick based on whether you have anyone doing ops

### Option A — Managed platform (recommended to start)

Use a platform that runs the container for you and gives you managed Postgres and
Redis as add-ons: **Railway**, **Render**, or **Fly.io** are the common choices.
You `git push`, it builds the Dockerfile in this repo, and you get a public HTTPS
URL immediately with certificates handled automatically.

**Why start here:** no server to patch, no SSH keys to manage, no 3am pages when a
disk fills up. For a small team without a dedicated systems administrator, this is
the difference between "the app is down and nobody knows why" and "check the
platform's dashboard."

Rough steps (Render as the example, the others are very similar):
1. Push this repository to GitHub (private repo).
2. On Render: **New → Web Service**, connect the repo, it detects the `Dockerfile`.
3. Add a **Postgres** and a **Redis** instance from Render's dashboard (managed,
   automatic backups included on paid tiers).
4. Set the environment variables from `.env.production.example` in the service's
   dashboard (Render injects `DATABASE_URL`/host details — adjust `configuration.ts`
   to read those if you go this route, or just set `DB_HOST` etc. to the values
   Render shows you).
5. Render gives you `https://emi-corehub.onrender.com` immediately; add your own
   domain (`api.enhancedmutual.sl`) under the service's **Custom Domains** tab —
   it issues the certificate for you.
6. Run the seed script once via Render's shell tab: `npm run seed`.

Cost: roughly **$25–50/month** total for a small web service + small Postgres +
small Redis on Render or Railway at this usage scale.

### Option B — Self-managed VPS (cheaper long-run, more control, more responsibility)

Use `docker-compose.prod.yml` and `Dockerfile` in this repo directly on a VM you
control. Good once you outgrow Option A or want full control over backups,
scaling, and where the data physically sits.

1. **Provision a VM.** DigitalOcean, Hetzner, or AWS Lightsail are all fine.
   4GB RAM / 2 vCPU is enough for Postgres + Redis + the API at this scale.
   Ubuntu 24.04. Pick the region with the lowest measured latency from Sierra
   Leone (test, don't assume — see above).
2. **Point DNS at it.** Buy a domain, add an `A` record for
   `api.enhancedmutual.sl` → the VM's IP. If you want DDoS protection and a CDN
   in front for free, put the domain behind Cloudflare (orange-cloud the record)
   — works fine with Caddy behind it.
3. **Install Docker** on the VM (`curl -fsSL https://get.docker.com | sh`).
4. **Copy the repo to the VM**, create `.env.production` from
   `.env.production.example` with real secrets (generate them with
   `openssl rand -hex 32`, never reuse the example values).
5. **Edit the `Caddyfile`** — replace `api.enhancedmutual.sl` with your real
   domain.
6. **Bring it up:**
   ```bash
   docker compose -f docker-compose.prod.yml up -d --build
   docker compose -f docker-compose.prod.yml exec api npm run seed
   ```
   Caddy automatically requests and renews the HTTPS certificate — nothing else
   to configure.
7. **Firewall the VM** so only ports 80, 443, and 22 (SSH, ideally key-only) are
   reachable from the internet. Postgres and Redis are never published to the
   host's public interface in `docker-compose.prod.yml` — they're only reachable
   from the `api` container over Docker's internal network. Don't change that.
8. **Set up automated backups now, not later.** `scripts/backup.sh` and
   `scripts/restore.sh` are tested and ready (see below) — add the cron entry
   from the comment at the bottom of `backup.sh` before you have any real data
   worth losing, not after.

Cost: roughly **$20–30/month** for the VM + **$10–15/year** for the domain.
Cheaper than Option A at this scale, but you're now responsible for patching the
VM, watching disk space, and restoring backups yourself if something breaks.

---

## The frontend

`EMI_CoreHub_Connected.html` is a static file — it doesn't need Node or a server
of its own, just somewhere to serve a plain HTML file over HTTPS:

- **Simplest:** host it on the same domain via Caddy/Nginx as a static file, or
  drop it on **Cloudflare Pages** / **Netlify** (both have a free tier that's more
  than enough for one HTML file) with its own subdomain like
  `app.enhancedmutual.sl`.
- Either way, **change the default API base URL** in the file from
  `http://localhost:3000/api/v1` to `https://api.enhancedmutual.sl/api/v1` so
  staff don't have to type it in on the login screen every time — I can make that
  edit once you have the real domain.
- Because it's a single static file with no backend of its own, there's no
  server-side cost here at all beyond whatever free static host you pick.

---

## Before real staff put real client data into this

This is the point where "a working prototype" and "something people's PII goes
into" stop being the same conversation. Here's what's already handled, and
what's still on you:

- **Migrations are in place and tested.** `src/migrations/` has the initial
  schema, generated and verified against a genuinely fresh database (including
  the `uuid-ossp` extension the UUID primary keys depend on, which some managed
  Postgres roles don't have permission to create implicitly — this migration
  creates it explicitly so it doesn't fail silently on a locked-down provider).
  `synchronize` is now hard-off in production; `migrationsRun: true` applies
  pending migrations automatically on boot instead, which is safe and idempotent
  for a single-instance deployment. When you change an entity later, run
  `npm run migration:generate -- src/migrations/DescriptiveName` and commit the
  result — never let `synchronize` touch a database with real data in it again.
- **Backup and restore scripts exist and have been tested end-to-end**
  (`scripts/backup.sh`, `scripts/restore.sh`) — dumped a real database, dropped
  it completely, restored from the compressed dump, and confirmed the data came
  back intact. `backup.sh` rotates local copies and optionally pushes to any
  S3-compatible storage (Backblaze B2, DigitalOcean Spaces, Cloudflare R2, real
  S3) if you set `BACKUP_S3_BUCKET`. **Set up the cron entry at the bottom of
  `backup.sh` before real data goes in** — the scripts existing isn't the same
  as them running on a schedule. If you're on Render/Railway's managed Postgres
  instead of self-hosting, check their dashboard for automated backups on your
  plan tier instead of using these scripts — they assume the
  `docker-compose.prod.yml` self-hosted setup.
- **Set real secrets.** `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, and the
  database password must not be the placeholder values anywhere near production.
- **Turn on MFA** for Super Admin and Finance Manager accounts — the mechanism
  is already built (`AuthService`), it just needs `mfaEnabled: true` set on those
  users and each person enrolled with an authenticator app.
- **Restrict who can reach `/audit-logs` and `/users`** — already role-gated to
  Super Admin / Internal Auditor in the code, just make sure those roles are only
  handed to the right people when you create real accounts.
- Everything else flagged in the backend README's "Not yet done" section
  (real SMS provider integration, S3 for documents, penetration testing) is worth
  reading again with an actual go-live date in mind.

---

## What I'd actually do, concretely, this week

1. Buy the domain now if you don't have one — it's the one thing with a lead time
   (registration + DNS propagation).
2. Stand it up on **Render or Railway** (Option A) first. Get staff using it,
   see how it holds up, fix what breaks.
3. Revisit self-hosting (Option B) later if cost or control becomes a real issue
   — moving from one to the other later is a config change, not a rewrite.
