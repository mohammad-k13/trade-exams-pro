import type { Metadata } from "next";
import { acceptInviteAction } from "@/app/actions/auth";
import { AuthShell, PasswordForm } from "@/components/auth-forms";
import { Alert } from "@/components/ui";
import { t } from "@/lib/i18n";
import { findValidInvite } from "@/server/auth";

export const metadata: Metadata = { title: t.auth.inviteTitle };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await findValidInvite(token);
  if (!invite) {
    return (
      <AuthShell title={t.auth.inviteTitle}>
        <Alert>{t.auth.inviteInvalid}</Alert>
      </AuthShell>
    );
  }
  return (
    <AuthShell title={t.auth.inviteTitle} hint={t.auth.inviteHint}>
      <p className="mb-4 text-sm">{invite.user.fullName}</p>
      <PasswordForm action={acceptInviteAction.bind(null, token)} withCurrent={false} submit={t.auth.activate} />
    </AuthShell>
  );
}
