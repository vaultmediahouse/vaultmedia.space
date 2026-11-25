# Architecture

One Next.js 16 (App Router) application on Node.js, backed by PostgreSQL.

```
Browser ──► Next.js (src/proxy.ts: cookie check only)
             ├─ Pages (Server Components)      src/app/admin/*, src/app/portal/*
             ├─ Server Actions (mutations)     src/actions/*.ts
             ├─ Route Handlers (files, PDFs,   src/app/api/*
             │   CSV, cron, webhook)
             └─ Services (business rules)      src/server/*.ts
                   └─ pure rules (unit-tested) src/lib/workflow.ts, lead-rules.ts, week.ts, money.ts
                   └─ Drizzle ORM ─► PostgreSQL (src/db/schema.ts, migrations in drizzle/)
```

## Layers and rules

- **Pure rules** (`src/lib/workflow.ts`, `lead-rules.ts`, `week.ts`, `money.ts`): no I/O. The state machine, dual approval, lead qualification, billing week and money maths live here and are unit-tested.
- **Services** (`src/server/*`): the only code that changes data. Every function takes the acting `User` and enforces data isolation, role, state machine, then writes an audit-log row. Pages and actions never write to the database directly (except trivial reads).
- **Server Actions** (`src/actions/*`): parse form input, call a service, map errors to messages, revalidate paths. Signature `(prev, formData) => ActionState` for `useActionState` (`src/lib/action.ts`).
- **Pages**: Server Components. Each page calls `requireAdmin()` / `requireClient()`; client pages always filter by the session's `client_id`.
- **Proxy** (`src/proxy.ts`): only redirects requests without a session cookie to `/login`. It is not an authorization layer.

## Key flows

**Work Item lifecycle** — `createWorkItem → submit (creator's approval) → approve (other side) → sanctioned → in_progress → delivered (needs a deliverable) → accepted (client, or auto after 48 h) → billed (weekly invoice) → paid`. Side states: rejected, revision_requested, cancelled. Edits to title/brief/qty/rate after submission reset the other side's approval.

**Weekly billing** — `/api/cron/daily` → `runAutoAccept()` → `runWeeklyInvoices()` for the last closed week → per client `generateInvoice()`: accepted items + billable leads up to the cut-off, one transaction, invoice number reserved atomically from settings, items → billed, leads tagged with invoice id. Thursday: `runPaymentReminders()`.

**Documents** — template (Markdown + `{{vars}}`) → `createFromTemplate()` fills from client, rate card, settings → edit → `sendDocument()` (refuses unfilled variables) → client opens (`viewed`) → `acceptDocument()` with checkbox + typed name + IP → locked. Editing a locked doc creates a new version in the same `group_id`.

## Security model

- Auth: `src/lib/auth.ts` (bcrypt cost 12, server-side sessions, 7-day absolute + configurable idle timeout, 5 failed logins / 15 min per username or IP, all sessions revoked on password change or reset).
- Isolation: client users can only load rows with their `client_id`; services re-check on every mutation.
- Files: served only via HMAC-signed links that expire after 1 hour (`/api/files/[key]`).
- Documents render Markdown with raw HTML escaped and unsafe link schemes removed (`src/lib/markdown.ts`).
- CSV export guards against spreadsheet formula injection (`src/lib/csv.ts`).
- Security headers in `next.config.ts` (no framing, nosniff, referrer policy).
- Cron and webhook endpoints require secrets (`CRON_SECRET`; per-client HMAC token for webhooks).

## Directory map

| Path | What |
| --- | --- |
| `src/app/(auth)` | Login, forced password change |
| `src/app/admin` | Admin screens |
| `src/app/portal` | Client screens |
| `src/app/api` | Files, PDFs, CSV export, cron, lead webhook |
| `src/app/d/[token]` | Shareable document link → sign in → document |
| `src/components` | UI kit (`ui.tsx`), forms (`action-form.tsx`), shared screens (work, invoice, leads, doc editor) |
| `src/server` | Services: work-items, leads, billing, documents, rate-cards, queries (read models), pdf |
| `src/lib` | Pure rules, auth, settings, storage, audit, notify, templates, markdown, csv |
| `src/db` | Drizzle schema and client |
| `drizzle/` | SQL migrations (generated) |
| `scripts/seed.ts` | First admin, templates, settings, optional demo data |
| `tests/` | Unit + integration tests |
