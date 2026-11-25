# Progress — what is built, what is not

Last updated: 25 Nov 2026. Status of every PRD section ([PRD.md](PRD.md)). Legend: ✅ built and tested · 🟡 partly built · ⬜ not built.

## Summary

Phase 1 (MVP) is complete, plus several Phase 2 items (auto-sanction, CSV export, comments, payment reference upload, lead webhook, DPA and deposit templates, reminders). Nothing is deployed yet and no real client data has been entered. Code is in the local working tree of `vaultmediahouse/vaultmedia.space`; it is on `main` and pushed to GitHub (25 Nov 2026). The repo is public, so `docs/PRD.md` is public too (see [DECISIONS.md](DECISIONS.md) D-012). Vercel-ready since v0.2.0 (Blob storage, schedule, build-time migrations) but **not deployed yet** — see RUNBOOK "Deploying to Vercel".

## PRD §15 acceptance criteria

| Criterion | Status | Evidence |
| --- | --- | --- |
| A client cannot see another client's data | ✅ | Every client page filters by the session's `client_id`; services re-check (`load()` in `src/server/work-items.ts`, `loadFor()` in documents, invoice/lead checks). Integration test "clients cannot see or act on another client's items" + invoice/doc isolation asserts. |
| No Sanctioned without both approvals; post-sanction qty/rate edit resets approvals | ✅ | `src/lib/workflow.ts` (unit tests) + integration tests. Approve buttons also carry the terms the user saw; a mismatch is refused. |
| Weekly invoice includes only Accepted items and approved qualified leads; totals match export | ✅ | `src/server/billing.ts`; integration test checks lines, GST, idempotency, cut-off roll-over. Verified in browser: invoice ₹1,600 = ledger CSV ₹1,600. |
| Document shows Viewed and Accepted with timestamps; locked after acceptance | ✅ | `src/server/documents.ts`; integration test; editing an accepted doc creates v2 and leaves v1 untouched. |
| Admin creates a client login + copyable message in under a minute | ✅ | Client page → "Create login" → message with WhatsApp/Telegram buttons. Verified in browser. |

## By PRD section

| § | Feature | Status | Notes |
| --- | --- | --- | --- |
| 2.1 | Rate card (image, video, lead, extra revision, setup fee) | ✅ | Per client (`rate_cards`), defaults in Settings. Setup fee is stored and used in the Deposit template; it is not auto-invoiced (add a manual "other" Work Item if billing it through the weekly cycle). |
| 2.2 | Qualified lead rules | ✅ | `src/lib/lead-rules.ts`. Phone validation is for Indian mobiles (10 digits starting 6–9). |
| 2.3 | Weekly cycle, Sunday 8 PM IST cut-off, Monday invoice, 3-day window, Thursday reminder + pause | ✅ | Daily cron `/api/cron/daily` (must be scheduled at deploy). "Pause" = clients cannot create new requests while an invoice is overdue; Admin can still create items. |
| 2.4 | Worked example ₹8,800 | ✅ | Unit test in `tests/week.test.ts`. |
| 2.5 | Ad management fee tiers | ⬜ | Out of v1 scope (PRD says "optional, later"). |
| 3 | Roles, 1–3 logins per client | ✅ | Max 3 active logins enforced. |
| 4 | Work Item, status flow, side states, approval rules, audit with IP, auto-sanction | ✅ | Revision requests beyond the free limit create a paid "Extra revision" item that needs Admin approval. |
| 5 | Admin dashboard: home, clients, work (table + kanban + filters + bulk), leads, billing, documents, settings | ✅ | |
| 6 | Client dashboard: home, my work, my leads, billing, documents | ✅ | |
| 7 | Document Manager: templates with variables, editor + preview, PDF, send, share link, statuses, e-acceptance, versions, required-docs checklist, block-work rule | ✅ | Editor is Markdown with live preview, not WYSIWYG (D-006). Templates need a lawyer's review before real use. |
| 7A | Credentials: no signup, temp password, forced change, bcrypt, reset/deactivate, rate limit, idle timeout | ✅ | Magic link / Telegram login: ⬜ (optional later). |
| 8 | Notifications: in-app + email; WhatsApp/Telegram copy-and-send | ✅ | Email needs `RESEND_API_KEY`; otherwise logged to the server console. Telegram bot: ⬜ (v2). |
| 9 | Data model | ✅ | See [DATABASE.md](DATABASE.md) for additions beyond the PRD. |
| 10 | Key screens | ✅ | |
| 11 | CSV export (work, leads, ledger), PDF invoice, metrics | ✅ | CSV only (opens in Excel); native .xlsx: ⬜. "Statement" PDF (multi-invoice): ⬜ — ledger CSV covers it. |
| 12 | Security: RBAC, isolation, hashed passwords, signed expiring file links, audit log, lead data deletion | ✅ | HTTPS and **daily DB backup** depend on hosting — see [RUNBOOK.md](RUNBOOK.md). Retention auto-deletion: ⬜ (manual "Erase data" exists). |
| 13 | Tech stack | ✅ | Next.js 16 + PostgreSQL (Drizzle). See [ARCHITECTURE.md](ARCHITECTURE.md). |
| 14 | Phase 2: lead webhook, payment ref, export, comments, reminders, DPA/deposit templates, auto-sanction | ✅ | Phase 3 (Telegram bot, Razorpay links, analytics): ⬜. |

## Verified on 25 Nov 2026

- `npm run typecheck`, `npm run lint`: clean.
- `npm test`: 28 unit tests pass (incl. storage drivers). With `TEST_DATABASE_URL` set: 13 integration tests also pass (41 total). Production build clean.
- v0.2.0: real file upload through the UI on the local driver; signed link returns the file, a tampered signature returns 403.
- Manual browser run (local, demo data): admin first login + forced password change; create client login + credentials message; create and submit Work Item; client login + forced change; client approval → Sanctioned; generate weekly invoice; invoice page; invoice PDF and document PDF return valid PDFs; ledger CSV totals match; NDA created from template with variables filled; phone width has no page-level horizontal scroll.
- Not verified by hand in the browser (covered by integration tests only): delivery → acceptance → revision UI, document acceptance UI, lead status UI clicks, CSV upload UI, cron endpoint call, email via Resend.

## Known gaps and risks

1. **Blob driver tested with a mocked SDK only** (tests/storage.test.ts); first real upload on Vercel should be checked by hand after deploy.
2. **Not deployed**; database backups depend on the chosen Postgres provider.
3. Legal templates are drafts, not legal advice.
4. No automated browser (E2E) tests yet.
