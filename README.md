# Vault Media House — Client Work & Billing Portal

A two-sided portal for Vault Media House and its clients: Work Items with dual approval, lead delivery and feedback, automatic weekly invoices, and a document manager for contracts, SOWs, NDAs, DPAs and deposit invoices.

- **Admin (Chief):** clients and logins, rate cards, work items, leads, billing, documents, reports, audit log, settings.
- **Client:** request and approve work, review deliveries, mark leads, pay and upload payment references, accept documents.

Nothing is billable until **both** sides approve it and the client accepts the delivery.

## Quick start

```bash
npm install
cp .env.example .env.local   # fill DATABASE_URL, APP_SECRET, CRON_SECRET
npm run db:migrate
npm run db:seed              # prints the first admin password once
npm run dev
```

Stack: Next.js 16 · React 19 · PostgreSQL · Drizzle ORM · Tailwind CSS 4 · @react-pdf/renderer · Vitest.

Full documentation is in [`docs/`](docs/README.md): status, roadmap, architecture, database, decisions and runbook.
