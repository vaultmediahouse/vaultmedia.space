# Changelog

## 0.3.0 — 26 Nov 2026
Live on Vercel (https://www.vaultmedia.space) and the remaining launch items.
- **Deployed.** Neon Postgres (prod + separate preview), private Blob store, secrets per environment (D-017). Production admin `chief` seeded. Fix: the Vercel project had no framework preset, so the first successful build served only static files (every page 404 `NOT_FOUND`); framework set to Next.js on the project and pinned in `vercel.json` (`"framework": "nextjs"`).
- `vercel.json`: functions run in `sin1` (Singapore), next to the database.
- **₹ in PDFs**: Noto Sans latin-ext subset (SIL OFL, `src/server/fonts/`) registered as a per-glyph fallback after Helvetica; invoices print "₹1,600.00" instead of "Rs. 1,600.00" (D-018). Font files are traced into the PDF routes (`outputFileTracingIncludes`).
- **Invoice adjustment lines**: Admin can add a charge (e.g. setup fee) or discount to an invoice until the client pays or submits a payment reference; GST and totals are recalculated, the client is notified, every change is audited (D-019).
- **Lead data retention**: daily job anonymises leads older than *Settings → Erase lead personal data after (months)*, default 12, 0 = off (D-020). The cron response now includes `leadsErased`.
- Re-delivery after a revision request requires a new deliverable (file or link) added since the previous delivery.
- Negative amounts display as "-₹500".
- Demo seed: the proposed demo item's created time matches its approval time.
- Tests: 48 (unit incl. PDF render + 15 integration).

## 0.2.1 — 25 Nov 2026
Fix the failed Vercel deployment (`dpl_6ZrFabXYB3rwW98cNPahQLsHzXBE`, commit `a849d78`) and let Admin choose a client's first password.
- Build no longer needs a database: the Postgres pool opens on first query instead of at import. Before, `next build` crashed with "DATABASE_URL is not set" while collecting page data for `/api/cron/daily` (reproduced in a clean copy with no env vars).
- Database URL is read from `DATABASE_URL`, or the names Neon/Supabase integrations set (`POSTGRES_URL`, `DATABASE_URL_UNPOOLED`, `POSTGRES_URL_NON_POOLING`, `POSTGRES_PRISMA_URL`). Migrations prefer the direct (non-pooled) URL. If none is set, `drizzle-kit migrate` stops with a clear message instead of "url: undefined".
- Admin → client → Create login has an optional password field; blank still generates a strong temporary password. The client must change it at first sign-in either way.
- Tests: 32 unit + 13 integration = 45.

## 0.2.0 — 25 Nov 2026
Vercel readiness.
- File storage: private Vercel Blob driver, chosen automatically when a Blob store is connected; local disk stays the default elsewhere. Downloads still go through signed, expiring links.
- `vercel.json` schedule `daily-billing` (09:00 IST) for `/api/cron/daily`.
- `vercel-build` script runs database migrations before `next build`.
- Links in messages fall back to the Vercel production domain when `APP_URL` is unset.
- `engines.node >= 22`. Storage driver tests added (41 tests total).

## 0.1.0 — 25 Nov 2026
First build of the portal from PRD v1.0 (Phase 1 MVP + parts of Phase 2).
- Auth: Admin-created logins, temporary passwords, forced change, bcrypt, rate limiting, idle timeout, credential messages for WhatsApp/Telegram.
- Clients, per-client rate cards, max 3 logins per client, activate/deactivate.
- Work Items with dual approval, auto-sanction limit, edit-resets-approval, delivery files/links, accept / auto-accept, free and paid revisions, comments, history, table + kanban, bulk actions.
- Leads: manual add, CSV import (Meta export), webhook, duplicate detection (30 days), Fake/Wrong within 48 h, replacements, erase on request.
- Weekly billing: IST Sunday cut-off, idempotent invoice generation, GST option, invoice PDF, client payment-reference upload, mark paid, void, overdue pause, Thursday reminders, ledger.
- Document Manager: 5 templates (Contract, SOW, NDA, DPA, Deposit) with variables, Markdown editor with preview, send + share link, viewed/accepted tracking with typed name + IP, signed-PDF upload, versioning, required-docs checklist, block-work rule, PDF export.
- Reports (leads/week, fake %, approval time, revenue/week, outstanding), CSV exports, audit log, notifications (in-app + email).
- Tests: 24 unit + 13 integration.
- Fix during build: approval concurrency guard compared timestamps (Postgres µs vs JS ms) and always failed; now compares the approved terms instead.
