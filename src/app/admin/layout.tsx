import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { t } from "@/lib/i18n";
import { currentUser, homePath } from "@/server/session";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "ADMIN") redirect(homePath(user.role));
  return (
    <AppShell nav={[{ href: "/admin", label: t.nav.institutes }]} userName={user.fullName} roleLabel={t.roles.ADMIN}>
      {children}
    </AppShell>
  );
}
