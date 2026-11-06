"use server";

import { redirect } from "next/navigation";
import { t } from "@/lib/i18n";
import { run } from "@/server/action";
import { acceptInvite, changePassword, destroySession, login } from "@/server/auth";
import { AppError } from "@/server/errors";
import { clearSessionCookie, clientIp, currentUser, homePath, readSessionCookie, setSessionCookie } from "@/server/session";

export interface FormState {
  error?: string;
}

export async function loginAction(_: FormState, form: FormData): Promise<FormState> {
  const result = await run(async () => {
    const { user, session } = await login(String(form.get("identifier") ?? ""), String(form.get("password") ?? ""), await clientIp());
    await setSessionCookie(session.token, session.expiresAt);
    return user;
  });
  if (result.error !== undefined) return { error: result.error };
  redirect(result.data.mustChangePassword ? "/change-password" : homePath(result.data.role));
}

export async function logoutAction() {
  await destroySession(await readSessionCookie());
  await clearSessionCookie();
  redirect("/login");
}

export async function changePasswordAction(_: FormState, form: FormData): Promise<FormState> {
  const user = await currentUser();
  if (!user) redirect("/login");
  const next = String(form.get("next") ?? "");
  if (next !== String(form.get("repeat") ?? "")) return { error: t.auth.passwordMismatch };
  const result = await run(async () => {
    await changePassword(user, String(form.get("current") ?? ""), next);
    // Changing the password ends all sessions, so this device gets a new one.
    const { createSession } = await import("@/server/auth");
    const session = await createSession(user.id);
    await setSessionCookie(session.token, session.expiresAt);
  });
  if (result.error !== undefined) return { error: result.error };
  redirect(homePath(user.role));
}

export async function acceptInviteAction(token: string, _: FormState, form: FormData): Promise<FormState> {
  const password = String(form.get("next") ?? "");
  if (password !== String(form.get("repeat") ?? "")) return { error: t.auth.passwordMismatch };
  const result = await run(async () => {
    const { user, session } = await acceptInvite(token, password);
    await setSessionCookie(session.token, session.expiresAt);
    if (!user) throw new AppError(t.auth.inviteInvalid);
    return user;
  });
  if (result.error !== undefined) return { error: result.error };
  redirect(homePath(result.data.role));
}
