# Changelog

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
