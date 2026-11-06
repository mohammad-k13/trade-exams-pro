import { db } from "./db";

/**
 * Fixed-window counter in Postgres. Atomic through upsert, and shared across serverless instances.
 * Returns true when the call is allowed.
 */
export async function hit(key: string, limit: number, windowMs: number, now = new Date()): Promise<boolean> {
  const resetAt = new Date(now.getTime() + windowMs);
  const rows = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimit" ("key", "count", "resetAt") VALUES (${key}, 1, ${resetAt})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimit"."resetAt" <= ${now} THEN 1 ELSE "RateLimit"."count" + 1 END,
      "resetAt" = CASE WHEN "RateLimit"."resetAt" <= ${now} THEN ${resetAt} ELSE "RateLimit"."resetAt" END
    RETURNING "count"`;
  return rows[0].count <= limit;
}

export async function peek(key: string, limit: number, now = new Date()): Promise<boolean> {
  const row = await db.rateLimit.findUnique({ where: { key } });
  return !row || row.resetAt <= now || row.count < limit;
}

export async function clear(key: string): Promise<void> {
  await db.rateLimit.deleteMany({ where: { key } });
}
