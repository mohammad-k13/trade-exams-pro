import { StudentForm } from "@/components/master/student-forms";
import { PageHeader } from "@/components/ui";
import { t } from "@/lib/i18n";
import { requireMaster } from "@/server/session";
import { listGroups } from "@/server/students";

export const metadata = { title: t.students.add };

export default async function NewStudentPage() {
  const groups = await listGroups(await requireMaster());
  return (
    <>
      <PageHeader title={t.students.add} />
      <StudentForm groups={groups.map(({ id, name }) => ({ id, name }))} />
    </>
  );
}
