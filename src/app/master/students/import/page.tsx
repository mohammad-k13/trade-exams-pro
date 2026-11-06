import { ImportForm } from "@/components/master/student-forms";
import { PageHeader } from "@/components/ui";
import { t } from "@/lib/i18n";
import { requireMaster } from "@/server/session";

export const metadata = { title: t.students.import };

export default async function ImportPage() {
  await requireMaster();
  return (
    <>
      <PageHeader title={t.students.import} />
      <ImportForm />
    </>
  );
}
