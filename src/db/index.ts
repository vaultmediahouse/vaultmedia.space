import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";
import { MISSING_DB_MESSAGE, resolveDatabaseUrl } from "./url";

type Database = NodePgDatabase<typeof schema> & { $client: Pool };

const globalForDb = globalThis as unknown as { __vaultDb?: Database };

function makeDb(): Database {
  const url = resolveDatabaseUrl();
  if (!url) throw new Error(MISSING_DB_MESSAGE);
  const pool = new Pool({
    connectionString: url,
    max: Number(process.env.DB_POOL_MAX ?? 5),
    ssl: url.includes("sslmode=require") ? { rejectUnauthorized: false } : undefined,
  });
  return drizzle(pool, { schema });
}

/** Opens the pool on first use, not at import, so `next build` works without a database (D-015). */
function getDb(): Database {
  // Reuse one pool across hot reloads in dev and across requests on Fluid Compute.
  globalForDb.__vaultDb ??= makeDb();
  return globalForDb.__vaultDb;
}

export const db: Database = new Proxy({} as Database, {
  get(_target, prop) {
    const real = getDb();
    const value = Reflect.get(real, prop, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export type DB = Database;
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
export { schema };
