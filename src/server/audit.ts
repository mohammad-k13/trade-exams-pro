import { db } from "./db";
import type { Actor } from "./authz";

export async function audit(
  actor: Pick<Actor, "id" | "organizationId"> | null,
  action: string,
  entity?: { type: string; id: string; meta?: Record<string, string | number | boolean | null> },
): Promise<void> {
  await db.auditLog.create({
    data: {
      organizationId: actor?.organizationId ?? null,
      actorId: actor?.id ?? null,
      action,
      entityType: entity?.type,
      entityId: entity?.id,
      meta: entity?.meta,
    },
  });
}
