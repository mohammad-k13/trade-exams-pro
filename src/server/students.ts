import { t } from "@/lib/i18n";
import { firstError, studentInput } from "@/lib/schemas";
import { audit } from "./audit";
import { createInvite } from "./auth";
import { assertMaster, type Actor } from "./authz";
import { db } from "./db";
import { AppError, NotFoundError } from "./errors";
import { generateTempPassword, hashPassword } from "./passwords";

const s = t.students;

function studentScope(organizationId: string) {
  return { organizationId, role: "STUDENT" as const, deletedAt: null };
}

export async function listStudents(actor: Actor, search = "") {
  assertMaster(actor);
  const q = search.trim();
  return db.user.findMany({
    where: {
      ...studentScope(actor.organizationId),
      ...(q
        ? { OR: [{ fullName: { contains: q, mode: "insensitive" } }, { username: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }] }
        : {}),
    },
    select: {
      id: true,
      fullName: true,
      username: true,
      phone: true,
      isActive: true,
      lastLoginAt: true,
      memberships: { select: { group: { select: { id: true, name: true, deletedAt: true } } } },
    },
    orderBy: { fullName: "asc" },
  });
}

export async function getStudent(actor: Actor, id: string) {
  assertMaster(actor);
  const student = await db.user.findFirst({
    where: { id, ...studentScope(actor.organizationId) },
    select: {
      id: true,
      fullName: true,
      username: true,
      phone: true,
      isActive: true,
      lastLoginAt: true,
      memberships: { select: { groupId: true } },
    },
  });
  if (!student) throw new NotFoundError();
  return student;
}

async function ensureUnique(username: string, phone: string | null, exceptId?: string) {
  const clash = await db.user.findFirst({
    where: { OR: [{ username }, ...(phone ? [{ phone }] : [])], ...(exceptId ? { NOT: { id: exceptId } } : {}) },
    select: { username: true },
  });
  if (clash) throw new AppError(clash.username === username ? t.validation.usernameTaken : t.validation.phoneTaken);
}

async function assertOwnGroups(organizationId: string, groupIds: string[]) {
  if (!groupIds.length) return;
  const count = await db.group.count({ where: { id: { in: groupIds }, organizationId, deletedAt: null } });
  if (count !== new Set(groupIds).size) throw new NotFoundError();
}

export async function createStudent(actor: Actor, raw: unknown) {
  assertMaster(actor);
  const parsed = studentInput.safeParse(raw);
  if (!parsed.success) throw new AppError(firstError(parsed.error));
  const { fullName, username, phone, groupIds } = parsed.data;
  await ensureUnique(username, phone);
  await assertOwnGroups(actor.organizationId, groupIds);
  const tempPassword = generateTempPassword();
  const student = await db.user.create({
    data: {
      role: "STUDENT",
      organizationId: actor.organizationId,
      fullName,
      username,
      phone,
      passwordHash: await hashPassword(tempPassword),
      mustChangePassword: true,
      memberships: { create: [...new Set(groupIds)].map((groupId) => ({ groupId })) },
    },
    select: { id: true, username: true, fullName: true },
  });
  await audit(actor, "student.created", { type: "user", id: student.id, meta: { name: fullName } });
  return { student, tempPassword };
}

export async function updateStudent(actor: Actor, id: string, raw: unknown) {
  assertMaster(actor);
  await getStudent(actor, id);
  const parsed = studentInput.safeParse(raw);
  if (!parsed.success) throw new AppError(firstError(parsed.error));
  const { fullName, username, phone, groupIds } = parsed.data;
  await ensureUnique(username, phone, id);
  await assertOwnGroups(actor.organizationId, groupIds);
  await db.$transaction([
    db.user.update({ where: { id }, data: { fullName, username, phone } }),
    db.groupMember.deleteMany({ where: { userId: id } }),
    db.groupMember.createMany({ data: [...new Set(groupIds)].map((groupId) => ({ groupId, userId: id })) }),
  ]);
  await audit(actor, "student.updated", { type: "user", id, meta: { name: fullName } });
}

export async function setStudentActive(actor: Actor, id: string, isActive: boolean) {
  assertMaster(actor);
  const student = await getStudent(actor, id);
  await db.user.update({ where: { id }, data: { isActive } });
  if (!isActive) await db.session.deleteMany({ where: { userId: id } });
  await audit(actor, isActive ? "student.activated" : "student.deactivated", { type: "user", id, meta: { name: student.fullName } });
}

export async function resetStudentPassword(actor: Actor, id: string) {
  assertMaster(actor);
  const student = await getStudent(actor, id);
  const tempPassword = generateTempPassword();
  await db.user.update({ where: { id }, data: { passwordHash: await hashPassword(tempPassword), mustChangePassword: true } });
  await db.session.deleteMany({ where: { userId: id } });
  await audit(actor, "student.password_reset", { type: "user", id, meta: { name: student.fullName } });
  return tempPassword;
}

export async function createStudentInvite(actor: Actor, id: string) {
  assertMaster(actor);
  const student = await getStudent(actor, id);
  const token = await createInvite(id);
  await audit(actor, "student.invite_created", { type: "user", id, meta: { name: student.fullName } });
  return token;
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else quoted = !quoted;
    } else if (ch === "," && !quoted) {
      cells.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  cells.push(cur.trim());
  return cells;
}

export interface ImportResult {
  created: { fullName: string; username: string; tempPassword: string }[];
  errors: { row: number; message: string }[];
}

/** Creates what is valid and reports the rest by row, so one typo doesn't block a whole class. */
export async function importStudents(actor: Actor, csv: string): Promise<ImportResult> {
  assertMaster(actor);
  const lines = csv.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) throw new AppError(s.importEmpty);
  if (lines.length > 501) throw new AppError(s.importTooMany);
  const header = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
  const col = {
    fullName: header.indexOf("full_name"),
    username: header.indexOf("username"),
    phone: header.indexOf("phone"),
    group: header.indexOf("group"),
  };
  if (col.fullName < 0 || col.username < 0) throw new AppError(s.importBadHeader);

  const groups = new Map(
    (await db.group.findMany({ where: { organizationId: actor.organizationId, deletedAt: null } })).map((g) => [g.name, g.id]),
  );
  const result: ImportResult = { created: [], errors: [] };

  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    const groupName = col.group >= 0 ? cells[col.group]?.trim() : "";
    try {
      let groupId = groupName ? groups.get(groupName) : undefined;
      if (groupName && !groupId) {
        const g = await db.group.create({ data: { name: groupName, organizationId: actor.organizationId } });
        groups.set(groupName, g.id);
        groupId = g.id;
      }
      const { student, tempPassword } = await createStudent(actor, {
        fullName: cells[col.fullName] ?? "",
        username: cells[col.username] ?? "",
        phone: col.phone >= 0 ? (cells[col.phone] ?? "") : "",
        groupIds: groupId ? [groupId] : [],
      });
      result.created.push({ fullName: student.fullName, username: student.username, tempPassword });
    } catch (e) {
      if (!(e instanceof AppError)) throw e;
      result.errors.push({ row: i + 1, message: e.message });
    }
  }
  await audit(actor, "student.imported", {
    type: "organization",
    id: actor.organizationId,
    meta: { created: result.created.length, failed: result.errors.length },
  });
  return result;
}

// --- Groups ---

export async function listGroups(actor: Actor) {
  assertMaster(actor);
  return db.group.findMany({
    where: { organizationId: actor.organizationId, deletedAt: null },
    select: {
      id: true,
      name: true,
      members: { where: { user: { deletedAt: null } }, select: { userId: true } },
    },
    orderBy: { name: "asc" },
  });
}

export async function saveGroup(actor: Actor, id: string | null, name: string, memberIds: string[]) {
  assertMaster(actor);
  const clean = name.trim();
  if (!clean) throw new AppError(t.validation.required);
  if (clean.length > 100) throw new AppError(t.validation.tooLong);
  const unique = [...new Set(memberIds)];
  const validCount = await db.user.count({ where: { id: { in: unique }, ...studentScope(actor.organizationId) } });
  if (validCount !== unique.length) throw new NotFoundError();

  if (id) {
    const group = await db.group.findFirst({ where: { id, organizationId: actor.organizationId, deletedAt: null } });
    if (!group) throw new NotFoundError();
    await db.$transaction([
      db.group.update({ where: { id }, data: { name: clean } }),
      db.groupMember.deleteMany({ where: { groupId: id } }),
      db.groupMember.createMany({ data: unique.map((userId) => ({ groupId: id, userId })) }),
    ]);
    await audit(actor, "group.updated", { type: "group", id, meta: { name: clean } });
    return id;
  }
  const group = await db.group.create({
    data: { name: clean, organizationId: actor.organizationId, members: { create: unique.map((userId) => ({ userId })) } },
  });
  await audit(actor, "group.created", { type: "group", id: group.id, meta: { name: clean } });
  return group.id;
}

export async function deleteGroup(actor: Actor, id: string) {
  assertMaster(actor);
  const group = await db.group.findFirst({ where: { id, organizationId: actor.organizationId, deletedAt: null } });
  if (!group) throw new NotFoundError();
  await db.group.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit(actor, "group.deleted", { type: "group", id, meta: { name: group.name } });
}
