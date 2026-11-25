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
| `APP_URL` | yes | Public base URL used in share links and credential messages. |
| `CRON_SECRET` | yes | Bearer token for `/api/cron/daily`. |
| `STORAGE_DIR` | no | Upload folder (default `./storage`). |
| `RESEND_API_KEY`, `EMAIL_FROM` | no | Email notifications. Without them, emails are logged. |
| `SEED_ADMIN_USERNAME`, `SEED_ADMIN_PASSWORD` | no | First admin for `db:seed`. |

## First-time configuration (after deploy)

1. Sign in as `chief` with the seed password; set your own.
2. Admin → Settings: address, GSTIN and GST toggle (open question PRD §16.1), UPI ID, bank details, cut-off, auto-accept window.
3. Admin → Documents → Templates: have a lawyer review once.
4. Admin → Clients → Add client → set rate card → Create login → send the message on WhatsApp.
5. Create Contract, SOW, NDA, DPA and Deposit documents from templates and send them.

## Scheduled job

Call daily at ~09:00 IST (03:30 UTC):

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://YOUR_DOMAIN/api/cron/daily
```

It auto-accepts deliveries, generates last week's invoices (idempotent; effectively Monday) and sends payment reminders on Thursdays. On Vercel use Vercel Schedules; on a VPS use crontab or a systemd timer.

## Deploying

- **VPS (works as-is):** `npm ci && npm run build && npm run db:migrate && npm start` behind Nginx/Caddy with HTTPS. Persistent `STORAGE_DIR`. Back up the database daily (`pg_dump`) and the storage folder.
- **Vercel / serverless:** first replace local file storage (`src/lib/storage.ts`) with Vercel Blob (private) or S3 — the disk is not persistent there. Use a hosted Postgres (Supabase, Neon) and turn on its daily backups (PRD §12).

## Common tasks

- **Client forgot password:** Admin → Clients → client → Reset password → send the new message.
- **Wrong invoice:** open it → Void invoice (unpaid only) → fix items/leads → Billing → Generate invoices again.
- **Lead data deletion request:** Admin → Leads → Erase data (invoiced leads keep an anonymised stub for the ledger).
- **Locked out after failed logins:** wait 15 minutes, or delete recent rows in `login_attempts` for that username.
