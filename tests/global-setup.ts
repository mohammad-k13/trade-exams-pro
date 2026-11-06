import { execSync } from "node:child_process";
import path from "node:path";
import { config } from "dotenv";

/** Applies migrations to the test database before any test runs. */
export default function setup() {
  config({ quiet: true, path: path.resolve(__dirname, "../.env") });
  const url =
    process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL?.replace(/\/([^/?]+)(\?.*)?$/, "/$1_test$2");
  execSync("npx prisma migrate deploy", {
    stdio: "pipe",
    env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
  });
}
