import { notFound } from "next/navigation";
import Link from "next/link";
import { StudentActions, StudentForm } from "@/components/master/student-forms";
import { AccuracyBar } from "@/components/charts";
import { Badge, Card, Empty, PageHeader, Table } from "@/components/ui";
import { formatDateTime, formatNumber, formatPercent } from "@/lib/format";
import { t } from "@/lib/i18n";
import { NotFoundError } from "@/server/errors";
import { getStudentReport } from "@/server/results";
import { requireMaster } from "@/server/session";
import { getStudent, listGroups } from "@/server/students";

const s = t.students;

export default async function StudentPage({ params }: { params: Promise<{ id: string }> }) {
  const master = await requireMaster();
  const { id } = await params;
  const student = await getStudent(master, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const [groups, report] = await Promise.all([listGroups(master), getStudentReport(master, id)]);
  return (
    <>
      <PageHeader
        title={student.fullName}
        subtitle={`${s.lastLogin}: ${student.lastLoginAt ? formatDateTime(student.lastLoginAt) : s.never}`}
        action={student.isActive ? <Badge tone="good">{s.active}</Badge> : <Badge>{s.inactive}</Badge>}
      />
      <div className="grid gap-5 xl:grid-cols-2">
        <div className="space-y-5">
          <StudentForm
            groups={groups.map(({ id, name }) => ({ id, name }))}
            student={{ id, fullName: student.fullName, username: student.username, phone: student.phone, groupIds: student.memberships.map((m) => m.groupId) }}
          />
          <StudentActions id={id} isActive={student.isActive} />
        </div>
        <div className="space-y-5">
          <Card title={t.result.topicStrengths}>
            {report.topics.length === 0 ? (
              <p className="text-sm text-muted">{t.analytics.empty}</p>
            ) : (
              <ul className="space-y-3">
                {report.topics.map((x) => (
                  <li key={x.id}>
                    <AccuracyBar label={x.name} value={x.correct / x.total} marker={x.classAccuracy} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title={s.profile}>
            {report.attempts.length === 0 ? (
              <Empty title={t.results.notAttempted} />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <th>{t.nav.exams}</th>
                    <th>{t.results.score}</th>
                    <th>{t.results.percent}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {report.attempts.map((a) => (
                    <tr key={a.id}>
                      <td>{a.exam.title}</td>
                      <td>{formatNumber(a.score ?? 0)} / {formatNumber(a.maxScore ?? 0)}</td>
                      <td>{a.maxScore ? formatPercent((a.score ?? 0) / a.maxScore) : "—"}</td>
                      <td><Link className="text-accent hover:underline" href={`/master/exams/${a.exam.id}/results/${a.id}`}>{t.results.viewAttempt}</Link></td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
