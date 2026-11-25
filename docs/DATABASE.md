# Database reference

PostgreSQL. Schema source of truth: `src/db/schema.ts`. Migrations: `drizzle/` (generate with `npm run db:generate`, apply with `npm run db:migrate`). Money columns are integer **paise**. Timestamps are `timestamptz`; dates stored as text are `YYYY-MM-DD` in IST.

## Tables

| Table | Purpose | Notable columns |
| --- | --- | --- |
| `clients` | Client companies | `require_docs_before_work` (block new work until Contract + SOW accepted), `active` |
| `users` | Admin and client logins | `role` admin/client, `username` unique, `password_hash` (bcrypt), `must_change_password`, `client_id` (null for admin) |
| `sessions` | Server-side sessions | `token_hash` (sha256 of cookie), `last_seen_at` (idle timeout), `expires_at` |
| `login_attempts` | Rate limiting | username, ip, success |
| `rate_cards` | One per client | image/video/lead/revision rates, `setup_fee`, `free_revisions`, `max_video_seconds`, `auto_sanction_limit` |
| `work_items` | Billable units of work | `number` (human id), `type`, `qty`, `rate`, `amount`, `status`, `admin_/client_approved_at/_by`, `sanctioned_at`, `delivered_at`, `accepted_at`, `auto_accepted`, `revision_count`, `parent_id` (paid revision → creative), `invoice_id` |
| `attachments` | Brief / deliverable files or links | `kind`, `storage_key` or `url` |
| `comments` | Thread per Work Item | |
| `leads` | Leads per client | `phone_normalized` (duplicate detection), `answers` jsonb, `status`, `status_changed_at`, `is_duplicate`, `duplicate_of`, `replaces_id`, `replaced_by`, `invoice_id` |
| `invoices` | Weekly invoices | `number` unique, `week_start`/`week_end`, `subtotal`, `tax_rate_bps`, `tax`, `total`, `status` (sent / payment_submitted / paid / void), `due_date`, `payment_ref`; unique (`client_id`, `week_start`) |
| `invoice_lines` | Invoice lines | `kind` work_item / leads / adjustment (adjustments: Admin charges/discounts, D-019) |
| `doc_templates` | Markdown templates | `body`, `variables` |
| `documents` | Client documents, versioned | `group_id` (all versions), `version`, `status`, `share_token`, `sent_at`, `viewed_at`, `accepted_at`, `accepted_ip`, `accepted_name`, `signed_storage_key`, `superseded_by` |
| `activity_log` | Audit trail | user, client, entity, action, before/after jsonb, ip |
| `notifications` | In-app notifications | user, event, title, href, read_at |
| `settings` | Key/value JSON | key `app`: see `AppSettings` in `src/lib/settings.ts` (also holds `nextInvoiceNumber`; `leadRetentionMonths` added 26 Nov 2026, default 12 — no migration, defaults merge in) |

## Differences from the PRD §9 summary

- `users.must_change_password`, `sessions`, `login_attempts`, `notifications`, `settings` added for PRD §7A/§8/§5.
- `work_items` adds `number`, approver ids, `sanctioned_at`, `auto_accepted`, `revision_count`, `parent_id`, `rejection_reason`.
- `leads` adds `invoice_id` (leads are billed directly, D-005), `phone_normalized`, `duplicate_of`, `replaces_id`, `source`, `status_changed_at`.
- `documents` adds `group_id`, `title`, `share_token`, `accepted_name`, `accepted_by`, `signed_storage_key`, `expires_at`, `superseded_by`; no `pdf_url` (PDFs are generated on demand).
- `invoice_lines.kind`; `invoices.tax_rate_bps`, `payment_submitted_at`, `reminder_sent_at`.
- `rate_cards` adds `setup_fee`, `free_revisions`, `max_video_seconds`.
- Voiding an invoice rewrites its `week_start` to `<date>#void-<id>` to free the (client, week) slot for regeneration while keeping the number.

## Migration log

| Migration | Date | Change |
| --- | --- | --- |
| `0000_init` | 25 Nov 2026 | Initial schema (16 tables) |
