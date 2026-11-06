import path from "node:path";
import { config } from "dotenv";
import { defineConfig } from "vitest/config";

config({ quiet: true });

// Tests always use a separate database, never the one in DATABASE_URL.
const testUrl =
  process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL?.replace(/\/([^/?]+)(\?.*)?$/, "/$1_test$2");
if (!testUrl) throw new Error("Set TEST_DATABASE_URL or DATABASE_URL");

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 20000,
    env: { DATABASE_URL: testUrl, DIRECT_URL: testUrl, APP_URL: "http://localhost:3000" },
  },
});
