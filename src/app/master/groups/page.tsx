import { GroupsManager } from "@/components/master/groups";
import { PageHeader } from "@/components/ui";
import { t } from "@/lib/i18n";
import { requireMaster } from "@/server/session";
import { listGroups, listStudents } from "@/server/students";

export const metadata = { title: t.groups.title };

export default async function GroupsPage() {
  const master = await requireMaster();
  const [groups, students] = await Promise.all([listGroups(master), listStudents(master)]);
  return (
    <>
      <PageHeader title={t.groups.title} />
      <GroupsManager
        groups={groups.map((g) => ({ id: g.id, name: g.name, memberIds: g.members.map((m) => m.userId) }))}
        students={students.filter((s) => s.isActive).map((s) => ({ id: s.id, fullName: s.fullName }))}
      />
    </>
  );
}
