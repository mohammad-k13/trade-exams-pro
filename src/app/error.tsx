"use client";

import { Button, Empty } from "@/components/ui";
import { t } from "@/lib/i18n";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto max-w-xl p-6 pt-24">
      <Empty title={t.common.errorTitle} hint={t.common.genericError} action={<Button onClick={reset}>{t.common.tryAgain}</Button>} />
    </main>
  );
}
