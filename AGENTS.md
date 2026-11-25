<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project rules (Vault Media House portal)

- Read `docs/README.md` first. `docs/PROGRESS.md` says what is built; `docs/ROADMAP.md` what is next.
- Keep docs current in the same change: PROGRESS, DECISIONS (new choices), DATABASE (schema/migrations), RUNBOOK (env/ops), CHANGELOG.
- Business rules live in pure modules (`src/lib/workflow.ts`, `lead-rules.ts`, `week.ts`, `money.ts`) with unit tests. Data changes go through `src/server/*` services, which enforce client isolation and write the audit log.
- Money is integer paise. Time zone is Asia/Kolkata.
- Before finishing: `npm run typecheck && npm run lint && npm test` (plus integration tests with `TEST_DATABASE_URL`).
