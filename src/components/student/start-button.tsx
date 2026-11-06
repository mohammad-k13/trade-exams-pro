"use client";

import { useState, useTransition } from "react";
import { startAttemptAction } from "@/app/actions/student";
import { Alert, Button } from "@/components/ui";
import { t } from "@/lib/i18n";

export function StartExamButton({ examId, label }: { examId: string; label: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-3">
      {error && <Alert>{error}</Alert>}
      <Button
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await startAttemptAction(examId);
            if (r?.error) setError(r.error);
          })
        }
      >
        {pending ? t.common.loading : label}
      </Button>
    </div>
  );
}
