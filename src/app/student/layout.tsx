import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { t } from "@/lib/i18n";
import { currentUser, homePath } from "@/server/session";

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "STUDENT") redirect(homePath(user.role));
  return (
    <AppShell
      nav={[
        { href: "/student", label: t.nav.myExams },
        { href: "/change-password", label: t.auth.changeTitle },
      ]}
      userName={user.fullName}
      roleLabel={t.roles.STUDENT}
    >
      {children}
    </AppShell>
  );
}
