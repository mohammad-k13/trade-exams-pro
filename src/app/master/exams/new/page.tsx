import { ExamBuilder } from "@/components/master/exam-builder";
import { PageHeader } from "@/components/ui";
import { t } from "@/lib/i18n";
import { requireMaster } from "@/server/session";
import { loadBuilderOptions } from "../load-builder";

export const metadata = { title: t.exams.add };

export default async function NewExamPage() {
  const options = await loadBuilderOptions(await requireMaster());
  return (
    <>
      <PageHeader title={t.exams.add} />
      {/* eslint-disable-next-line react-hooks/purity -- server component; used only for default dates */}
      <ExamBuilder {...options} now={Date.now()} />
    </>
  );
}
