import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Empty, Input, LinkButton, PageHeader, Table } from "@/components/ui";
import { toFaDigits } from "@/lib/format";
import { t } from "@/lib/i18n";
import { requireMaster } from "@/server/session";
import { listStudents } from "@/server/students";

const s = t.students;
export const metadata: Metadata = { title: s.title };

export default async function StudentsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const master = await requireMaster();
  const { q = "" } = await searchParams;
  const students = await listStudents(master, q);
  return (
    <>
      <PageHeader
        title={s.title}
        action={
          <>
            <LinkButton href="/master/students/import" variant="secondary">{s.import}</LinkButton>
            <LinkButton href="/master/students/new">{s.add}</LinkButton>
          </>
        }
      />
      {students.length === 0 && !q ? (
        <Empty
          title={s.empty}
          hint={s.emptyHint}
          action={
            <>
              <LinkButton href="/master/students/new">{s.add}</LinkButton>
              <LinkButton href="/master/students/import" variant="secondary">{s.import}</LinkButton>
            </>
          }
        />
      ) : (
        <>
          <form className="mb-4 max-w-sm" role="search">
            <Input name="q" defaultValue={q} placeholder={t.common.search} aria-label={t.common.search} />
          </form>
          {students.length === 0 ? (
            <Empty title={s.noMatch} />
          ) : (
            <Table>
              <thead>
                <tr>
                  <th>{s.fullName}</th>
                  <th>{s.username}</th>
                  <th>{s.phone}</th>
                  <th>{s.groups}</th>
                  <th>{s.status}</th>
                </tr>
              </thead>
              <tbody>
                {students.map((st) => (
                  <tr key={st.id}>
                    <td>
                      <Link href={`/master/students/${st.id}`} className="font-medium text-accent hover:underline">{st.fullName}</Link>
                    </td>
                    <td dir="ltr" className="text-end">{st.username}</td>
                    <td>{st.phone ? toFaDigits(st.phone) : "—"}</td>
                    <td className="text-muted">{st.memberships.filter((m) => !m.group.deletedAt).map((m) => m.group.name).join("، ") || "—"}</td>
                    <td>{st.isActive ? <Badge tone="good">{s.active}</Badge> : <Badge>{s.inactive}</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </>
      )}
    </>
  );
}
