import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { t } from "@/lib/i18n";
import { currentUser, homePath } from "@/server/session";

const n = t.nav;
const NAV = [
  { href: "/master", label: n.overview },
  { href: "/master/students", label: n.students },
  { href: "/master/groups", label: n.groups },
  { href: "/master/questions", label: n.questions },
  { href: "/master/exams", label: n.exams },
  { href: "/master/analytics", label: n.analytics },
  { href: "/master/audit", label: n.audit },
];

export default async function MasterLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "MASTER") redirect(homePath(user.role));
  return (
    <AppShell nav={NAV} userName={user.fullName} roleLabel={t.roles.MASTER}>
      {children}
    </AppShell>
  );
}
