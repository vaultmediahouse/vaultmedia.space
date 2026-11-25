# Vault Media House — Client Work & Billing Portal: PRD + Fee Structure

Owner: Chief (Vault Media House) · First client: Ahmedabad currency-counting-machine marketing company · Version 1.0 (source PRD, 25 Nov 2026). Build status per section: see docs/PROGRESS.md.

## 1. Overview

A small two-sided web portal where Chief (Admin) and each client get their own login, dashboard and work area. Work (creatives, lead batches, any other gig) is logged as a **Work Item**. A Work Item becomes billable only after **both** Chief and the client approve it. Billing is weekly and generated automatically from approved items. The Admin side also has a **Document Manager** for contracts, SOWs, invoices, NDAs and DPAs.

**Goals**

- One source of truth for what was promised, delivered, approved and owed.
- Remove disputes: nothing is billable without both approvals.
- Weekly payment rhythm with zero manual Excel work.
- Professional paperwork for every client, created and sent from one place.

**Non-goals (v1)**: running ads inside the portal, multi-agency support, in-app payment gateway (payment is recorded manually or via UPI/Razorpay link), a public signup page.

## 2. Fee Structure (Table-wise Breakdown)

### 2.1 Rate card

| # | Item | Unit | Rate (INR) | Billing | Notes |
| --- | --- | --- | --- | --- | --- |
| 1 | Creative: static image | per creative | 300 | Weekly, after dual approval | Includes up to 2 revisions |
| 2 | Creative: video / animated | per creative | 300 | Weekly, after dual approval | Includes up to 2 revisions; set a max length (e.g. 30 sec) |
| 3 | Interested lead | per qualified lead | 200 | Weekly, on approved leads only | See qualification rules below |
| 4 | Extra revision (beyond free) | per revision | 100 (suggested) | Weekly | Optional, protects your time |
| 5 | Setup / onboarding fee | one-time | 3,000 (suggested) | Upfront | Optional; covers account setup, lead form, tracking |

Rows 4 and 5 are suggestions; remove them if you want to keep the offer simple for the first client.

### 2.2 Qualified lead definition (put this in the SOW)

A lead is billable at ₹200 only when it has: a valid reachable phone number, a name, the business or use-case answer from the form, is not a duplicate within 30 days, and is not marked Fake/Wrong Number by the client within 48 hours of delivery. Replaced leads are not billed twice.

### 2.3 Weekly billing cycle

| Day | Event |
| --- | --- |
| Mon–Sun | Work Items and leads accumulate; client reviews and approves |
| Sunday 8 PM | Cut-off: only dual-approved items are counted |
| Monday | Invoice auto-generated and sent (WhatsApp/Telegram link + PDF) |
| Monday–Wednesday | Payment window (3 days) |
| Thursday | Reminder; if unpaid, new creatives are paused until cleared |

### 2.4 Worked example (one week just an example, where Leads is billing is done weekly and leads as many given not as per promised)

| Item | Qty | Rate | Amount |
| --- | --- | --- | --- |
| Image creatives | 4 | 300 | 1,200 |
| Video creatives | 2 | 300 | 600 |
| Intrestred leads | 35 | 200 | 7,000 |
| **Total (before GST, if applicable)** |  |  | **8,800** |

### 2.5 Optional: ad management fee (if you later manage the ad account)

| Monthly ad spend | Fee |
| --- | --- |
| Up to ₹10,000 | 20% (min ₹3,000) |
| ₹10,001 – ₹30,000 | 15% |
| Above ₹30,000 | 10% |

Ad budget is always paid by the client directly to the ad platform from their own ad account.

## 3. Users and Roles

| Role | Who | Can do |
| --- | --- | --- |
| Admin | Chief | Create clients and logins, create/edit/approve Work Items, manage documents, see all billing, reset credentials |
| Client | Each client contact | Create Work Item requests, approve/reject, review leads, view own documents and invoices, mark payments |

One client company can have 1–3 login users. Clients can never see other clients' data.

## 4. Core Concept: Work Item and Dual Approval

A **Work Item** (gig) is any unit of billable work: a creative, a batch of leads, a revision, a custom task.

**Fields**: title, type (Image / Video / Lead batch / Other), description or brief, quantity, unit rate (auto-filled from the rate card, editable by Admin only), amount, due date, attachments (preview files, links), created by, status, approval timestamps.

**Status flow**

1. **Draft**: created by Admin or Client, not yet submitted.
2. **Proposed**: submitted; waiting for the other party to review.
3. **Sanctioned**: approved by **both** Admin and Client. This is the gate; only sanctioned items can move forward.
4. **In Progress**: Admin is working on it.
5. **Delivered**: Admin uploads the final file or lead list.
6. **Accepted**: Client accepts the delivery (or auto-accepts after 48 hours of no response, configurable).
7. **Billed**: included in a weekly invoice.
8. **Paid**: payment recorded.

Side states: **Rejected** (with reason), **Revision Requested** (counts toward free revisions), **Cancelled**.

**Approval rules**

- Whoever creates an item counts as the first approval; the other party must approve to Sanction it.
- Any edit to quantity, rate or scope after sanction resets approvals and re-notifies both parties.
- Approvals are logged with user, time and IP.
- Admin can set a client to auto-sanction items below a value (for example under ₹500) to reduce friction.

## 5. Admin Dashboard (Chief)

**Home**: this week's totals (sanctioned, delivered, billed, paid, outstanding), items waiting for my approval, items waiting for client, upcoming due dates, leads received today.

**Clients**: list, add client, create login (username + temporary password), regenerate credentials, activate/deactivate, client notes.

**Work Items**: table and kanban views, filters by client/status/type/week, bulk actions, create item for a client, upload deliverables.

**Leads**: all leads per client with status; import by CSV or add via webhook from the lead form; mark duplicate/fake; replacement tracking.

**Billing**: weekly ledger per client, auto-generated invoices, payment status, export to Excel/CSV, running outstanding balance.

**Documents**: see Section 7.

**Settings**: rate card per client, tax/GST details, invoice numbering, week cut-off, auto-accept window, notification channels.

## 6. Client Dashboard

**Home**: this week's work summary, amount payable so far, items needing my approval, recent deliveries.

**My Work**: list of Work Items, create a new request, approve/reject/request revision, preview and download deliverables, comment thread per item.

**My Leads**: weekly lead list with name, phone, answers, time; buttons to mark Contacted / Interested / Fake / Wrong Number / Converted. This feedback keeps lead quality honest and speeds up billing.

**Billing**: weekly invoices, payment instructions (UPI QR or bank details), upload payment reference, payment history.

**Documents**: view, sign (e-accept) and download documents shared by Admin.

## 7. Documentation Manager (Admin only, shareable to Client)

Create, store, version, send and track client paperwork from templates.

| Document | Purpose | Key fields filled from client record |
| --- | --- | --- |
| Freelance Agreement / Contract | Scope, deliverables, payment terms, IP ownership, confidentiality, termination, dispute resolution | Parties, dates, rate card, payment cycle, jurisdiction |
| Statement of Work (SOW) | Exactly what is delivered and what is out of scope; lead qualification definition; revision limits | Deliverables list, quantities, timelines |
| Deposit Invoice + Payment Schedule | Upfront deposit (typically 30–50%) and milestone or weekly payments | Amount, due dates, bank/UPI details |
| NDA / Confidentiality Agreement | Protects sensitive business information | Parties, term, jurisdiction |
| Data Processing Agreement | Needed when handling personal data (leads); aligned to India's DPDP Act and general privacy norms | Data categories, purpose, retention, security measures |
| Weekly Invoice | Auto-generated from billed Work Items | Line items, tax, totals |

**Features**

- Template library with variables, such as {{client\_name}}, {{rate\_image}}, {{lead\_rate}}, {{start\_date}}.
- Create from template, edit in a rich-text editor, preview, export to PDF.
- Send to client by portal notification plus a shareable link sent via WhatsApp or Telegram.
- Status: Draft, Sent, Viewed, Accepted/Signed, Expired, Archived.
- Client e-acceptance: checkbox plus typed name, timestamp and IP captured; optional upload of a signed PDF.
- Version history; once signed, a document is locked and any change creates a new version.
- Required-docs checklist per client (Contract, SOW, NDA, DPA, Deposit) with a progress indicator; an optional rule can block new Work Items until the Contract and SOW are accepted.
- Note: templates are starting points. Have a lawyer review them once before use.

## 7A. Credentials and Access

- No public signup. Admin creates each client user.
- Admin sets username and generates a strong temporary password; the portal shows a ready-to-send message for copying into WhatsApp or Telegram.
- First login forces a password change. Passwords are stored hashed (bcrypt or argon2), never in plain text.
- Admin can reset or deactivate access at any time. Login attempts are rate-limited; sessions expire after inactivity.
- Optional later: a one-time magic link or Telegram bot login.

## 8. Notifications

Channels: in-app and email in v1; WhatsApp/Telegram message links in v1 as copy-and-send; automated Telegram bot in v2.

Events: new item proposed, approval needed, item sanctioned/rejected, delivery uploaded, revision requested, new leads, weekly invoice ready, payment reminder, document sent/viewed/accepted.

## 9. Data Model (summary)

- **User**: id, role, name, username, password\_hash, client\_id, active, last\_login.
- **Client**: id, company, contact, phone, email, GST no., rate\_card\_id, notes.
- **RateCard**: id, client\_id, image\_rate, video\_rate, lead\_rate, revision\_rate, auto\_sanction\_limit.
- **WorkItem**: id, client\_id, type, title, brief, qty, rate, amount, status, created\_by, admin\_approved\_at, client\_approved\_at, due\_date, delivered\_at, accepted\_at, invoice\_id.
- **Attachment**: id, work\_item\_id, file\_url, kind (brief / deliverable), uploaded\_by.
- **Lead**: id, client\_id, work\_item\_id, name, phone, answers (JSON), received\_at, status, is\_duplicate, is\_billable, replaced\_by.
- **Invoice**: id, client\_id, number, week\_start, week\_end, subtotal, tax, total, status, due\_date, paid\_at, payment\_ref.
- **InvoiceLine**: id, invoice\_id, work\_item\_id, description, qty, rate, amount.
- **Document**: id, client\_id, type, version, content, pdf\_url, status, sent\_at, viewed\_at, accepted\_at, accepted\_ip.
- **DocTemplate**: id, type, body, variables.
- **ActivityLog**: id, user\_id, entity, action, before/after, timestamp.
- **Comment**: id, work\_item\_id, user\_id, text, created\_at.

## 10. Key Screens

1. Login and forced password change
2. Admin home
3. Client list and client detail (rates, users, documents, ledger)
4. Work Item board and detail with approval panel and comment thread
5. Leads table with status actions
6. Weekly ledger and invoice view
7. Document Manager: library, editor, send, tracking, required-docs checklist
8. Client home, My Work, My Leads, Billing, Documents
9. Settings

## 11. Reporting and Export

- Excel/CSV export of Work Items, leads and ledger by date range and client.
- PDF weekly invoice and statement.
- Simple metrics: leads per week, approval time, fake-lead percentage, revenue per week, outstanding balance.

## 12. Security and Compliance

- Role-based access; strict client data isolation.
- HTTPS only; hashed passwords; signed, expiring file links.
- Audit log for approvals, edits, document acceptance and billing changes.
- Leads contain personal data: store only needed fields, set a retention period, support deletion on request, and cover this in the DPA.
- Daily database backup.

## 13. Suggested Tech Stack

Next.js (or React) with a Node backend, PostgreSQL (Supabase is a quick option), file storage on Supabase/S3, PDF generation via an HTML-to-PDF library, email through Resend or similar, deployed on Vercel or a small VPS. Build with your coding agent from this PRD; keep v1 to one client but design every table with client\_id from day one.

## 14. Phased Plan

**Phase 1 (MVP, about 1–2 weeks of build)**: login and credential creation, clients, rate card, Work Items with dual approval, leads list with statuses, weekly ledger and PDF invoice, basic document manager (Contract, SOW, NDA templates, send link, acceptance).

**Phase 2**: DPA and deposit templates, auto-sanction limits, lead webhook import, payment reference upload, Excel export, comment threads, reminders.

**Phase 3**: Telegram bot notifications and login, Razorpay payment links, multi-client polish, analytics.

## 15. Acceptance Criteria (MVP)

- A client cannot see another client's data.
- A Work Item cannot reach Sanctioned without both approvals, and any post-sanction edit to qty or rate resets approvals.
- A weekly invoice includes only Accepted and approved items and approved qualified leads; totals match the Excel export.
- A document sent to a client shows Viewed and Accepted with timestamps, and cannot be edited after acceptance.
- Admin can create a client login and copy a ready-to-send credentials message in under one minute.

## 16. Open Questions

1. Is GST applicable on your invoices, and do you want it shown?
2. Should the free revision limit be 2 per creative, as assumed here?
3. Should deliveries auto-accept after 48 hours of silence?
4. Will leads come in via a Meta lead form export (CSV) or a webhook into the portal?
5. Do you want the Contract and SOW to be mandatory before any work starts?
