import { t } from "@/lib/i18n";
import { demoRequestInput, firstError, text, username as usernameSchema } from "@/lib/schemas";
import { z } from "zod";
import { audit } from "./audit";
import { assertAdmin, type Actor } from "./authz";
import { db } from "./db";
import { AppError } from "./errors";
import { generateTempPassword, hashPassword } from "./passwords";
import { hit } from "./rate-limit";

export async function adminOverview(actor: Actor) {
  assertAdmin(actor);
  const [orgs, demoRequests] = await Promise.all([
    db.organization.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        createdAt: true,
        users: { where: { deletedAt: null, role: "MASTER" }, select: { id: true, fullName: true, username: true } },
        _count: { select: { exams: { where: { deletedAt: null } } } },
      },
    }),
    db.demoRequest.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
  ]);
  const studentCounts = await db.user.groupBy({
    by: ["organizationId"],
    where: { role: "STUDENT", deletedAt: null },
    _count: { _all: true },
  });
  const counts = new Map(studentCounts.map((c) => [c.organizationId, c._count._all]));
  return { orgs: orgs.map((o) => ({ ...o, studentCount: counts.get(o.id) ?? 0 })), demoRequests };
}

const createOrgInput = z.object({ orgName: text(150), masterName: text(100), masterUsername: usernameSchema });

export async function createOrganization(actor: Actor, raw: unknown) {
  assertAdmin(actor);
  const parsed = createOrgInput.safeParse(raw);
  if (!parsed.success) throw new AppError(firstError(parsed.error));
  const { orgName, masterName, masterUsername } = parsed.data;
  if (await db.user.findUnique({ where: { username: masterUsername } })) throw new AppError(t.validation.usernameTaken);
  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);
  const org = await db.organization.create({
    data: {
      name: orgName,
      users: { create: { role: "MASTER", fullName: masterName, username: masterUsername, passwordHash, mustChangePassword: true } },
    },
  });
  await audit({ id: actor.id, organizationId: org.id }, "org.created", { type: "organization", id: org.id, meta: { name: orgName } });
  return { orgId: org.id, tempPassword, username: masterUsername };
}

export async function markDemoHandled(actor: Actor, id: string) {
  assertAdmin(actor);
  await db.demoRequest.updateMany({ where: { id, handledAt: null }, data: { handledAt: new Date() } });
}

export async function submitDemoRequest(raw: unknown, ip: string) {
  if (!(await hit(`demo:${ip}`, 5, 60 * 60 * 1000))) throw new AppError(t.common.rateLimited, 429);
  const parsed = demoRequestInput.safeParse(raw);
  if (!parsed.success) throw new AppError(firstError(parsed.error));
  await db.demoRequest.create({ data: { ...parsed.data, phone: parsed.data.phone! } });
}
