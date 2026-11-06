import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { changePasswordAction } from "@/app/actions/auth";
import { AuthShell, PasswordForm } from "@/components/auth-forms";
import { t } from "@/lib/i18n";
import { currentUser } from "@/server/session";

export const metadata: Metadata = { title: t.auth.changeTitle };

export default async function ChangePasswordPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return (
    <AuthShell title={t.auth.changeTitle} hint={user.mustChangePassword ? t.auth.changeForcedHint : undefined}>
      <PasswordForm action={changePasswordAction} withCurrent submit={t.common.save} />
    </AuthShell>
  );
}
