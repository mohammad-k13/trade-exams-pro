import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { loginAction } from "@/app/actions/auth";
import { AuthShell, LoginForm } from "@/components/auth-forms";
import { t } from "@/lib/i18n";
import { currentUser, homePath } from "@/server/session";

export const metadata: Metadata = { title: t.auth.loginTitle };

export default async function LoginPage() {
  const user = await currentUser();
  if (user) redirect(user.mustChangePassword ? "/change-password" : homePath(user.role));
  return (
    <AuthShell title={t.auth.loginTitle} hint={t.auth.loginHint}>
      <LoginForm action={loginAction} />
    </AuthShell>
  );
}
