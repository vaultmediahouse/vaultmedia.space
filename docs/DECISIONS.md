# Decision records

Short records of choices that are not obvious from the code. Newest last. Format: context → decision → why → consequences.

## D-001 Stack: Next.js 16 App Router + PostgreSQL + Drizzle (25 Nov 2026)
PRD §13 suggests Next.js, Node backend, PostgreSQL. One Next.js app with Server Actions and Route Handlers serves both the UI and the API, so there is no separate backend to deploy. Drizzle ORM gives typed SQL and plain SQL migrations (`drizzle/`). Works with any Postgres: local, Supabase, Neon.

## D-002 Custom username/password auth, not a hosted auth provider (25 Nov 2026)
PRD §7A requires: no public signup, Admin-created usernames, temporary passwords, forced change at first login, bcrypt, rate limiting, idle timeout. Hosted providers are email-first and built around self-signup. A small in-house implementation (`src/lib/auth.ts`) matches the PRD exactly. Sessions are server-side rows; the cookie holds a random token and only its SHA-256 is stored. Trade-off: we own security maintenance; keep it small and audited.

## D-003 Money as integer paise (25 Nov 2026)
Avoids floating-point rounding in totals and GST. UI converts with `src/lib/money.ts`.

## D-004 Billing week = Monday 00:00 IST to Sunday cut-off (default 20:00 IST) (25 Nov 2026)
IST has no daylight saving, so a fixed +05:30 offset is exact (`src/lib/week.ts`). An item counts in the week in which it became billable: Work Items at `accepted_at`, leads at `billableSince()`. Anything missed earlier is caught up on the next invoice. One invoice per client per week (unique index) makes the job idempotent.

## D-005 When a lead becomes billable (25 Nov 2026)
PRD §2.2 allows the client 48 h to mark a lead Fake/Wrong Number. Decision: a qualified lead becomes billable at the earlier of (a) the client marking it Contacted/Interested/Converted within the window, or (b) the window closing with no Fake/Wrong mark. A Fake/Wrong mark after 48 h is recorded but does not remove the lead from billing. Leads still inside the window at the cut-off roll into next week. Leads are billed directly as one invoice line ("Interested leads × N"), not via a Lead-batch Work Item, because PRD §2.4 bills "as many as given".

## D-006 Markdown editor with live preview instead of a WYSIWYG rich-text editor (25 Nov 2026)
PRD §7 says "rich-text editor". Markdown keeps documents diffable, versionable as plain text, safe (raw HTML is escaped) and easy to render to PDF. Trade-off: less familiar for non-technical editing. Revisit if Chief finds it awkward.

## D-007 PDF via @react-pdf/renderer, not headless Chrome (25 Nov 2026)
Pure Node, small, works on serverless. Built-in fonts lack the ₹ glyph, so PDFs print "Rs.". Embedding a font with ₹ is a possible later improvement.

## D-008 Paid revisions are separate Work Items (25 Nov 2026)
A revision beyond the free limit creates a "Extra revision" Work Item already approved by the client (their request) and waiting for Admin approval. Keeps the dual-approval rule intact and makes the charge visible on the invoice.

## D-009 "Pause new creatives" when an invoice is overdue (25 Nov 2026)
Implemented as: client users cannot create new Work Items while any invoice is past its due date and unpaid. Admin is not blocked (they decide case by case). A banner explains it to the client.

## D-010 Auto-accept runs lazily and from the daily cron (25 Nov 2026)
No background worker. `runAutoAccept()` runs on dashboard/billing loads and in `/api/cron/daily`. Auto-accepted items get `accepted_at` = delivery time + window, so they land in the correct billing week even if the job runs late.

## D-011 Local-disk file storage behind a small interface (25 Nov 2026)
`src/lib/storage.ts` is the only module that touches files; downloads use HMAC-signed expiring URLs. Local disk is enough for development and a VPS. Superseded in part by D-013 (Vercel Blob driver added). Uploads are capped at 4 MB; larger creatives are shared as links (Drive/Canva/WeTransfer).

## D-012 Repository is public — PRD and pricing (25 Nov 2026)
`vaultmediahouse/vaultmedia.space` is a public GitHub repo. `docs/PRD.md` contains the rate card and the first client's description. No secrets are committed (`.env*` is gitignored except `.env.example`). Chief chose to push to the public repo on 25 Nov 2026, so the PRD is public. Making the repo private later is still possible but the content may already be cached.

## D-013 Vercel Blob (private) as the production file store (25 Nov 2026)
Vercel functions have no persistent disk. `src/lib/storage.ts` now picks a driver at runtime: private Vercel Blob when `BLOB_READ_WRITE_TOKEN` or `BLOB_STORE_ID` is set, local disk otherwise. Blobs are private and never linked directly; `/api/files/[key]` checks the HMAC-signed, expiring link and streams the blob server-side, so the access model is identical on both drivers. Keys are stored under `vmh-uploads/<key>`. Existing local files are not migrated automatically (none exist in production yet).

## D-015 Lazy database connection and accepted database URL names (25 Nov 2026)
The first Vercel deployment failed. `src/db/index.ts` created the pool at import and threw when `DATABASE_URL` was missing, which breaks `next build` page-data collection; and Marketplace Postgres integrations may set `POSTGRES_URL` etc. instead of `DATABASE_URL`. Now `db` is a proxy that opens the pool on first use, and `src/db/url.ts` resolves the URL from a fixed list of names (app: pooled first; migrations: direct first). A missing URL still fails the deploy at the migrate step, on purpose: deploying without tables would give a broken site.

## D-016 Admin may choose a client's first password (25 Nov 2026)
Chief asked to create a client with an ID and password and hand them over. The Create login form takes an optional password (same strength rule as user-chosen passwords: 10+ chars, letters and a number). It is still marked temporary, so the client must set their own at first sign-in; generated passwords stay the default.

## D-017 Vercel resources: Neon (Singapore), separate Preview DB, functions in sin1 (26 Nov 2026)
- Production database: Neon `vmh-prod` (free plan, region `sin1`, Neon Auth off — the portal has its own logins), connected to the **Production** environment only.
- Preview database: a separate Neon `vmh-preview` (same settings), connected to **Preview** only, so preview builds' migrations never touch production (D-014).
- Files: private Blob store `vmh-files` (region `sin1`), connected to Production and Preview (sets `BLOB_READ_WRITE_TOKEN`). Preview uploads land in the same store under random keys; acceptable for now.
- `vercel.json` `regions: ["sin1"]`: functions run next to the database (Vercel's default `iad1` would add a US round trip to every query). Singapore is the closest region to India that both Neon and Vercel offer.
- Secrets (`APP_SECRET`, `CRON_SECRET`) are generated per environment with `openssl rand -hex 32` piped into `vercel env add … --sensitive`, never printed. Values imported from `.env.local` were removed (they pointed at localhost and included the exposed `CRON_SECRET`).

## D-014 Vercel deployment: path schedule + migrations in `vercel-build` (25 Nov 2026)
- The daily job is a Vercel **path** schedule (`vercel.json`, 09:00 Asia/Kolkata, GET `/api/cron/daily`) protected by `CRON_SECRET`, not a private `function` target. Reasons: the route already exists and also serves VPS/crontab hosting, and the Next.js function output path for a `function` target could not be verified without a linked project. Trade-off: the route is public and relies on the secret. Possible later move to a `function` target with `handleSchedule` (keep the schedule name `daily-billing`).
- `npm run vercel-build` = `drizzle-kit migrate && next build`, so every deployment applies pending migrations to its `DATABASE_URL` before building. Consequence: **Preview deployments must use a separate database** (or a Neon branch), otherwise a preview build migrates production.
