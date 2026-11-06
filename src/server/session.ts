// Bridges the auth core to Next.js cookies, pages and server actions.
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { resolveSession, type SessionUser } from "./auth";
import { assertMaster, assertStudent, type MasterActor } from "./authz";
import { AppError, ForbiddenError } from "./errors";

const COOKIE = "tq_session";

export async function setSessionCookie(token: string, expiresAt: Date) {
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function readSessionCookie() {
  return (await cookies()).get(COOKIE)?.value;
}

export async function clearSessionCookie() {
  (await cookies()).delete(COOKIE);
}

export const currentUser = cache(async (): Promise<SessionUser | null> => {
  return resolveSession(await readSessionCookie());
});

export function homePath(role: SessionUser["role"]) {
  return role === "ADMIN" ? "/admin" : role === "MASTER" ? "/master" : "/student";
}

async function requireUser(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/change-password");
  return user;
}

/**
 * For pages and server actions. Anyone without the role goes to their own home page.
 * The services check the role again, so a mistake here still cannot expose data.
 */
async function requireRole(role: SessionUser["role"]): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== role) redirect(homePath(user.role));
  return user;
}

export async function requireMaster(): Promise<SessionUser & MasterActor> {
  const user = await requireRole("MASTER");
  assertMaster(user);
  return user;
}

export async function requireStudent(): Promise<SessionUser> {
  return requireRole("STUDENT");
}

export async function requireAdmin(): Promise<SessionUser> {
  return requireRole("ADMIN");
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
}

/**
 * CSRF defense for route handlers. SameSite=Lax already blocks cross-site POST cookies; this adds an
 * explicit Origin check. Server Actions get the equivalent check from Next.js itself.
 */
export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host) throw new ForbiddenError();
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new ForbiddenError();
  }
  if (originHost !== host) throw new ForbiddenError();
}

/** For route handlers: no redirects, always a status code. */
export async function apiStudent(request: Request): Promise<SessionUser> {
  assertSameOrigin(request);
  const user = await currentUser();
  if (!user) throw new AppError("لطفاً دوباره وارد شوید.", 401);
  if (user.mustChangePassword) throw new ForbiddenError();
  assertStudent(user);
  return user;
}

export function jsonError(error: unknown): Response {
  if (error instanceof AppError) return Response.json({ error: error.message }, { status: error.status });
  console.error(error);
  return Response.json({ error: "مشکلی پیش آمد. لطفاً دوباره تلاش کنید." }, { status: 500 });
}
