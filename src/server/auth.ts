// Authentication core. Framework-free so it can be tested without a request.
import { createHash, randomBytes } from "node:crypto";
import { toLatinDigits } from "@/lib/format";
import { t } from "@/lib/i18n";
import { password as passwordSchema, phone as phoneSchema, firstError } from "@/lib/schemas";
import { audit } from "./audit";
import type { Actor } from "./authz";
import { db } from "./db";
import { AppError } from "./errors";
import { hashPassword, verifyPassword } from "./passwords";
import { clear, hit, peek } from "./rate-limit";

export const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_PER_ID = 5;
const LOGIN_MAX_PER_IP = 30;

// Verified when the user does not exist, so response time does not reveal valid usernames.
const DUMMY_HASH = hashPassword(randomBytes(16).toString("hex"));

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export async function createSession(userId: string, now = new Date()): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  await db.session.create({ data: { id: sha256(token), userId, expiresAt } });
  return { token, expiresAt };
}

export interface SessionUser extends Actor {
  username: string;
  fullName: string;
  mustChangePassword: boolean;
}

export async function resolveSession(token: string | undefined, now = new Date()): Promise<SessionUser | null> {
  if (!token) return null;
  const session = await db.session.findUnique({ where: { id: sha256(token) }, include: { user: true } });
  if (!session || session.expiresAt <= now) return null;
  const u = session.user;
  if (!u.isActive || u.deletedAt) return null;
  return {
    id: u.id,
    role: u.role,
    organizationId: u.organizationId,
    username: u.username,
    fullName: u.fullName,
    mustChangePassword: u.mustChangePassword,
  };
}

export async function destroySession(token: string | undefined): Promise<void> {
  if (token) await db.session.deleteMany({ where: { id: sha256(token) } });
}

function normalizeIdentifier(raw: string): string {
  const s = toLatinDigits(raw).trim().toLowerCase();
  const asPhone = phoneSchema.safeParse(s);
  return asPhone.success && asPhone.data ? asPhone.data : s;
}

/** Throws AppError on failure; failures only count toward the limits. */
export async function login(identifier: string, password: string, ip: string, now = new Date()) {
  const id = normalizeIdentifier(identifier);
  const idKey = `login:id:${id}`;
  const ipKey = `login:ip:${ip}`;
  if (!(await peek(idKey, LOGIN_MAX_PER_ID, now)) || !(await peek(ipKey, LOGIN_MAX_PER_IP, now))) {
    throw new AppError(t.auth.tooMany, 429);
  }
  const user = await db.user.findFirst({ where: { OR: [{ username: id }, { phone: id }], deletedAt: null } });
  const valid = await verifyPassword(user?.passwordHash ?? (await DUMMY_HASH), password);
  if (!user || !valid || !user.isActive) {
    await hit(idKey, LOGIN_MAX_PER_ID, LOGIN_WINDOW_MS, now);
    await hit(ipKey, LOGIN_MAX_PER_IP, LOGIN_WINDOW_MS, now);
    throw new AppError(t.auth.invalid, 401);
  }
  await clear(idKey);
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: now } });
  await audit(user, "login.success", { type: "user", id: user.id });
  return { user, session: await createSession(user.id, now) };
}

export async function changePassword(actor: Actor, current: string, next: string): Promise<void> {
  const parsed = passwordSchema.safeParse(next);
  if (!parsed.success) throw new AppError(firstError(parsed.error));
  const user = await db.user.findUniqueOrThrow({ where: { id: actor.id } });
  if (!(await verifyPassword(user.passwordHash, current))) throw new AppError(t.auth.wrongCurrent);
  await db.$transaction([
    db.user.update({
      where: { id: actor.id },
      data: { passwordHash: await hashPassword(parsed.data), mustChangePassword: false },
    }),
    // Any other logged-in device must sign in again with the new password.
    db.session.deleteMany({ where: { userId: actor.id } }),
  ]);
  await audit(actor, "password.changed", { type: "user", id: actor.id });
}

export async function createInvite(userId: string, now = new Date()): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await db.inviteToken.updateMany({ where: { userId, usedAt: null }, data: { usedAt: now } });
  await db.inviteToken.create({
    data: { id: sha256(token), userId, expiresAt: new Date(now.getTime() + INVITE_TTL_MS) },
  });
  return token;
}

export async function findValidInvite(token: string, now = new Date()) {
  const invite = await db.inviteToken.findUnique({ where: { id: sha256(token) }, include: { user: true } });
  if (!invite || invite.usedAt || invite.expiresAt <= now || !invite.user.isActive || invite.user.deletedAt) return null;
  return invite;
}

export async function acceptInvite(token: string, password: string, now = new Date()) {
  const parsed = passwordSchema.safeParse(password);
  if (!parsed.success) throw new AppError(firstError(parsed.error));
  const invite = await findValidInvite(token, now);
  if (!invite) throw new AppError(t.auth.inviteInvalid, 410);
  const passwordHash = await hashPassword(parsed.data);
  // Conditional update, so a link cannot be used twice even by concurrent requests.
  const claimed = await db.inviteToken.updateMany({ where: { id: invite.id, usedAt: null }, data: { usedAt: now } });
  if (claimed.count !== 1) throw new AppError(t.auth.inviteInvalid, 410);
  await db.user.update({ where: { id: invite.userId }, data: { passwordHash, mustChangePassword: false } });
  await db.session.deleteMany({ where: { userId: invite.userId } });
  await audit(invite.user, "invite.accepted", { type: "user", id: invite.userId });
  return { user: invite.user, session: await createSession(invite.userId, now) };
}
