import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { __vaultPool?: Pool };

function makePool() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local.");
  return new Pool({
    connectionString: url,
    max: Number(process.env.DB_POOL_MAX ?? 5),
    ssl: url.includes("sslmode=require") ? { rejectUnauthorized: false } : undefined,
  });
}

// Reuse one pool across hot reloads in dev and across requests on Fluid Compute.
const pool = globalForDb.__vaultPool ?? makePool();
globalForDb.__vaultPool = pool;

export const db = drizzle(pool, { schema });
export type DB = typeof db;
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
export { schema };
