import Link from "next/link";
import { logoutAction } from "@/app/actions/auth";
import { Button } from "@/components/ui";
import { t } from "@/lib/i18n";

export function AppShell({
  nav,
  userName,
  roleLabel,
  children,
}: {
  nav: { href: string; label: string }[];
  userName: string;
  roleLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[14rem_1fr]">
      <aside className="no-print border-line bg-surface md:sticky md:top-0 md:h-dvh md:border-e">
        <div className="flex items-center justify-between gap-3 px-4 py-3 md:block md:px-5 md:py-5">
          <Link href="/" className="font-bold text-accent">
            {t.brand}
          </Link>
          <div className="flex items-center gap-2 md:mt-4 md:block">
            <p className="text-xs text-muted md:text-sm">
              {userName} <span className="hidden md:mt-0.5 md:block md:text-xs">{roleLabel}</span>
            </p>
          </div>
        </div>
        <nav aria-label="منوی اصلی" className="flex gap-1 overflow-x-auto border-t border-line px-3 py-2 md:block md:space-y-1 md:border-0 md:py-0">
          {nav.map((item) => (
            <Link key={item.href} href={item.href} className="block rounded-lg px-3 py-2 text-sm whitespace-nowrap hover:bg-white">
              {item.label}
            </Link>
          ))}
          <form action={logoutAction} className="md:mt-4 md:border-t md:border-line md:pt-2">
            <Button type="submit" variant="ghost" className="min-h-9 w-full justify-start px-3">
              {t.common.logout}
            </Button>
          </form>
        </nav>
      </aside>
      <main className="min-w-0 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
