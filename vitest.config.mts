import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // Server modules import "server-only"; outside Next.js it must resolve to a no-op.
      "server-only": path.resolve(__dirname, "tests/empty-module.ts"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    // Integration tests share one database; run files one after another.
    fileParallelism: false,
    env: {
      APP_SECRET: "test-secret-0123456789abcdef0123456789abcdef",
      ...(process.env.TEST_DATABASE_URL ? { DATABASE_URL: process.env.TEST_DATABASE_URL } : {}),
    },
  },
});
