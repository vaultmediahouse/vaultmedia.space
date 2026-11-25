import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";
import { MISSING_DB_MESSAGE, resolveMigrationUrl } from "./src/db/url";

config({ path: ".env.local" });
config();

const url = resolveMigrationUrl();
if (!url) throw new Error(MISSING_DB_MESSAGE);

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url },
});
