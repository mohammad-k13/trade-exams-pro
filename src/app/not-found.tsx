import { Empty, LinkButton } from "@/components/ui";
import { t } from "@/lib/i18n";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-xl p-6 pt-24">
      <Empty title={t.common.notFoundTitle} hint={t.common.notFound} action={<LinkButton href="/">{t.common.goHome}</LinkButton>} />
    </main>
  );
}
