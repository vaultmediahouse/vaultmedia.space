/**
 * Resolves the Postgres connection string.
 *
 * Vercel Marketplace integrations do not all use the name DATABASE_URL: Neon sets DATABASE_URL and
 * DATABASE_URL_UNPOOLED (or POSTGRES_URL…), Supabase sets POSTGRES_URL and POSTGRES_URL_NON_POOLING.
 * The app accepts any of them so a deploy does not fail on a naming difference (D-015).
 * Migrations prefer the direct (non-pooled) connection; the app prefers the pooled one.
 */
type Env = Record<string, string | undefined>;

const APP_KEYS = ["DATABASE_URL", "POSTGRES_URL", "POSTGRES_PRISMA_URL", "DATABASE_URL_UNPOOLED", "POSTGRES_URL_NON_POOLING"];
const MIGRATE_KEYS = ["DATABASE_URL_UNPOOLED", "POSTGRES_URL_NON_POOLING", "DATABASE_URL", "POSTGRES_URL"];

function first(env: Env, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = env[k]?.trim();
    if (v) return v;
  }
  return undefined;
}

export function resolveDatabaseUrl(env: Env = process.env): string | undefined {
  return first(env, APP_KEYS);
}

export function resolveMigrationUrl(env: Env = process.env): string | undefined {
  return first(env, MIGRATE_KEYS);
}

export const MISSING_DB_MESSAGE =
  "No database URL found. Set DATABASE_URL (or connect Neon/Supabase in Vercel → Storage, which sets " +
  "DATABASE_URL / POSTGRES_URL) for this environment. Locally: copy .env.example to .env.local.";
