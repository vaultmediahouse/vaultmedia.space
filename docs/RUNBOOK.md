# Runbook

## Local setup

Requirements: Node.js 22+, PostgreSQL 14+.

```bash
npm install
cp .env.example .env.local        # then fill DATABASE_URL, APP_SECRET (openssl rand -hex 32), CRON_SECRET
createdb vaultportal
npm run db:migrate
npm run db:seed                   # prints the first admin's temporary password ONCE
npm run dev                       # http://localhost:3000
```

Add `-- --demo` to the seed command for a demo client with sample work items and leads.

## Tests

```bash
npm run typecheck && npm run lint
npm test                                                     # unit tests
createdb vaultportal_test
DATABASE_URL=postgres://USER@localhost:5432/vaultportal_test npm run db:migrate
TEST_DATABASE_URL=postgres://USER@localhost:5432/vaultportal_test npm test   # + integration (wipes that DB)
```

## Environment variables

| Name | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | Postgres connection. Add `?sslmode=require` for hosted DBs. |
| `APP_SECRET` | yes | Signs file links and webhook tokens. Changing it invalidates existing links/webhook URLs. |
| `APP_URL` | recommended | Public base URL used in share links and credential messages. Falls back to the Vercel production domain. |
| `CRON_SECRET` | yes | Bearer token for `/api/cron/daily`. |
| `STORAGE_DIR` | no | Upload folder for local disk (default `./storage`). |
| `BLOB_STORE_ID` / `BLOB_READ_WRITE_TOKEN` | Vercel | Set by connecting a Vercel Blob store; switches uploads to private Blob. |
| `RESEND_API_KEY`, `EMAIL_FROM` | no | Email notifications. Without them, emails are logged. |
| `SEED_ADMIN_USERNAME`, `SEED_ADMIN_PASSWORD` | no | First admin for `db:seed`. |

## First-time configuration (after deploy)

1. Sign in as `chief` with the seed password; set your own.
2. Admin → Settings: address, GSTIN and GST toggle (open question PRD §16.1), UPI ID, bank details, cut-off, auto-accept window.
3. Admin → Documents → Templates: have a lawyer review once.
4. Admin → Clients → Add client → set rate card → Create login → send the message on WhatsApp.
5. Create Contract, SOW, NDA, DPA and Deposit documents from templates and send them.

## Scheduled job

`/api/cron/daily` should run once a day at ~09:00 IST. It auto-accepts deliveries, generates last week's invoices (idempotent; effectively Monday) and sends payment reminders on Thursdays.

- **Vercel:** already configured in `vercel.json` as the schedule `daily-billing` (Vercel Schedules, path target, needs `CRON_SECRET` set in the project). Run it once by hand: `vercel schedules invoke daily-billing`, or Project → Schedules → Run Schedule.
- **VPS:** crontab / systemd timer calling:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://YOUR_DOMAIN/api/cron/daily
```

## Deploying to Vercel

1. **Import the repo:** vercel.com → Add New → Project → `vaultmediahouse/vaultmedia.space`. Framework: Next.js (auto). Vercel runs `npm run vercel-build`, which applies migrations, then builds.
2. **Database:** Project → Storage → create/connect **Neon** or **Supabase** Postgres (Vercel Marketplace). Make sure `DATABASE_URL` is set for Production (add `?sslmode=require` if the provider's URL lacks it). Turn on the provider's daily backups (PRD §12). For **Preview**, point `DATABASE_URL` to a separate database or Neon branch — preview builds also run migrations (D-014).
3. **File storage:** Project → Storage → create a **Blob** store (private) and connect it. This sets `BLOB_STORE_ID` (OIDC) or `BLOB_READ_WRITE_TOKEN`; uploads then go to Blob automatically.
4. **Environment variables** (Project → Settings → Environment Variables, Production):
   - `APP_SECRET` — `openssl rand -hex 32` (new value; don't reuse the local one)
   - `CRON_SECRET` — `openssl rand -hex 16`
   - `APP_URL` — your live address, e.g. `https://portal.yourdomain.com` (optional; defaults to the Vercel production domain)
   - optional `RESEND_API_KEY`, `EMAIL_FROM`
5. **Deploy** (push to `main`, or Redeploy). Check the build log shows "migrations applied successfully".
6. **Create the first admin** against the production database, from your machine:

```bash
DATABASE_URL="<production url>" SEED_ADMIN_USERNAME=chief npx tsx scripts/seed.ts
```

   It prints a one-time temporary password. Sign in at your domain and change it. Do **not** use `--demo` in production.
7. **Smoke test:** upload a brief file on a Work Item and open it; run the `daily-billing` schedule once and check it returns `ok: true`.
8. **Custom domain** (optional): Project → Settings → Domains, then update `APP_URL`.

## Deploying to a VPS

`npm ci && npm run build && npm run db:migrate && npm start` behind Nginx/Caddy with HTTPS. Leave Blob variables unset so files go to a persistent `STORAGE_DIR`. Back up the database daily (`pg_dump`) and the storage folder.

## Common tasks

- **Client forgot password:** Admin → Clients → client → Reset password → send the new message.
- **Wrong invoice:** open it → Void invoice (unpaid only) → fix items/leads → Billing → Generate invoices again.
- **Lead data deletion request:** Admin → Leads → Erase data (invoiced leads keep an anonymised stub for the ledger).
- **Locked out after failed logins:** wait 15 minutes, or delete recent rows in `login_attempts` for that username.
