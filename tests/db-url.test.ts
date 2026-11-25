import { describe, expect, it } from "vitest";
import { resolveDatabaseUrl, resolveMigrationUrl } from "@/db/url";

describe("database URL resolution", () => {
  it("prefers DATABASE_URL for the app", () => {
    expect(resolveDatabaseUrl({ DATABASE_URL: "a", POSTGRES_URL: "b" })).toBe("a");
  });
  it("falls back to Supabase/Neon integration names", () => {
    expect(resolveDatabaseUrl({ POSTGRES_URL: "b" })).toBe("b");
    expect(resolveDatabaseUrl({ POSTGRES_URL_NON_POOLING: "c" })).toBe("c");
  });
  it("prefers the direct connection for migrations", () => {
    expect(resolveMigrationUrl({ DATABASE_URL: "pooled", DATABASE_URL_UNPOOLED: "direct" })).toBe("direct");
    expect(resolveMigrationUrl({ POSTGRES_URL: "pooled", POSTGRES_URL_NON_POOLING: "direct" })).toBe("direct");
  });
  it("ignores blanks and returns undefined when nothing is set", () => {
    expect(resolveDatabaseUrl({ DATABASE_URL: "  " })).toBeUndefined();
    expect(resolveMigrationUrl({})).toBeUndefined();
  });
});
