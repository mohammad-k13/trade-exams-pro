"use client";

import { useTransition } from "react";
import { deleteQuestionAction, duplicateQuestionAction } from "@/app/actions/master";
import { Button } from "@/components/ui";
import { ConfirmButton } from "@/components/ui/client";
import { t } from "@/lib/i18n";

export function QuestionRowActions({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex gap-1.5">
      <Button variant="secondary" className="min-h-8 px-3 text-xs" disabled={pending} onClick={() => start(async () => void (await duplicateQuestionAction(id)))}>
        {t.common.duplicate}
      </Button>
      <ConfirmButton label={t.common.delete} message={t.questions.deleteConfirm} action={() => deleteQuestionAction(id)} className="min-h-8 px-3 text-xs" />
    </div>
  );
}
