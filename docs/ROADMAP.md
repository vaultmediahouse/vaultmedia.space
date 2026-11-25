# Roadmap — what comes next

Ordered by priority. Update this file whenever an item starts or finishes (and PROGRESS.md).

## Before first real client use
1. ✅ **Deployed** 26 Nov 2026: https://www.vaultmedia.space (v0.3.0). Remaining by Chief: sign in as `chief` with the temporary password from the seed and set your own; fill Settings (business address, UPI ID, bank details, GSTIN if GST); create the first real client.
2. **Answer PRD §16 open questions** in Settings / rate card: GST on or off; free revisions (default 2); auto-accept 48 h (default on); leads via CSV or webhook (both built); Contract + SOW mandatory (per-client toggle).
3. **Lawyer review** of the five templates.
4. **Repo visibility** (D-012): the repo was pushed public on 25 Nov 2026; decide whether to make it private (the PRD may already be cached).
5. Set `RESEND_API_KEY` + `EMAIL_FROM` with a verified sending domain for email notifications (in-app notifications already work).
6. First real upload on production (Blob driver was only tested with a mocked SDK): upload a brief file on a Work Item and open it.

## Next improvements
7. Browser E2E tests (Playwright) for the main flows (all hand-tested in the browser on 26 Nov 2026).
8. Statement PDF (all invoices in a date range); ledger CSV covers it for now.
9. Move the daily job to a private Vercel `function` schedule target (D-014) to drop the public path + `CRON_SECRET`.
10. Optional: separate Blob store for Preview deployments.
11. Done 26 Nov 2026: ₹ font in PDFs (D-018), invoice adjustment lines (D-019), lead retention job (D-020).

## Phase 3 (PRD §14)
11. Telegram bot notifications and login.
12. Razorpay payment links on invoices + webhook to mark paid.
13. Multi-client polish and analytics charts.
14. Ad-management fee tiers (PRD §2.5) if Chief starts managing ad accounts.
