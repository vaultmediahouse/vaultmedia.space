# Roadmap — what comes next

Ordered by priority. Update this file whenever an item starts or finishes (and PROGRESS.md).

## Before first real client use
1. **Deploy to Vercel.** First attempt (commit `a849d78`) failed; build fixed in v0.2.1 (D-015). Make sure a database is connected for Production and Preview, use a newly generated `CRON_SECRET` (the one shown in chat on 25 Nov must not be used), redeploy, seed the production admin, check one real upload and run the schedule once.
2. **Answer PRD §16 open questions** in Settings / rate card: GST on or off; free revisions (default 2); auto-accept 48 h (default on); leads via CSV or webhook (both built); Contract + SOW mandatory (per-client toggle).
3. **Lawyer review** of the five templates.
4. **Repo visibility** (D-012): the repo was pushed public on 25 Nov 2026; decide whether to make it private (the PRD may already be cached).
5. Set `RESEND_API_KEY` for email notifications (needs a verified sending domain).

## Next improvements
6. Browser E2E tests (Playwright) for the delivery → accept → revision and document-accept screens.
7. Embed a font with the ₹ glyph in PDFs.
8. Lead retention job: auto-erase lead personal data after N months (DPA says 12).
9. Adjustment lines on invoices (discounts, setup fee) from the Billing page.
10. Statement PDF (all invoices in a date range).

## Phase 3 (PRD §14)
11. Telegram bot notifications and login.
12. Razorpay payment links on invoices + webhook to mark paid.
13. Multi-client polish and analytics charts.
14. Ad-management fee tiers (PRD §2.5) if Chief starts managing ad accounts.
