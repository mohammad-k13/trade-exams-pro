import Link from "next/link";
import { notFound } from "next/navigation";
import { AccuracyBar } from "@/components/charts";
import { Badge, Card, Empty, LinkButton, PageHeader, Stat, Table } from "@/components/ui";
import { formatDateTime, formatDuration, formatNumber, formatPercent, toFaDigits } from "@/lib/format";
import { t } from "@/lib/i18n";
import { NotFoundError } from "@/server/errors";
import { getExamResults } from "@/server/results";
import { requireMaster } from "@/server/session";

const r = t.results;

export default async function ExamResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const master = await requireMaster();
  const { id } = await params;
  const data = await getExamResults(master, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const { exam, rows, participation, average, analytics } = data;
  return (
    <>
      <PageHeader
        title={`${r.title}: ${exam.title}`}
        subtitle={t.exams.status[exam.displayStatus]}
        action={
          <>
            <LinkButton variant="secondary" href={`/master/exams/${id}`}>{t.common.back}</LinkButton>
            <a className="inline-flex min-h-10 items-center rounded-lg bg-accent px-4 text-sm font-medium text-white hover:bg-accent-strong" href={`/master/exams/${id}/export`}>{r.export}</a>
          </>
        }
      />
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Stat label={r.participation} value={`${toFaDigits(participation.done)} / ${toFaDigits(participation.total)}`} />
        <Stat label={r.average} value={average === null ? "—" : formatPercent(average)} />
        <Stat label={t.analytics.hardest} value={analytics.hardest[0] ? formatPercent(analytics.hardest[0].accuracy) : "—"} hint={analytics.hardest[0]?.title} />
      </div>
      {analytics.insights.length > 0 && (
        <Card title={t.analytics.insights} className="mb-5">
          <ul className="list-disc space-y-1.5 ps-5 text-sm leading-6">
            {analytics.insights.map((x) => <li key={x}>{x}</li>)}
          </ul>
        </Card>
      )}
      <section className="mb-5">
        <h2 className="mb-3 font-semibold">{r.perStudent}</h2>
        {rows.length === 0 ? (
          <Empty title={r.empty} />
        ) : (
          <Table>
            <thead>
              <tr>
                <th>{r.student}</th>
                <th>{r.score}</th>
                <th>{r.percent}</th>
                <th>{r.submittedAt}</th>
                <th>{r.status}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ student, best, inProgress }) => (
                <tr key={student.id}>
                  <td><Link className="hover:underline" href={`/master/students/${student.id}`}>{student.fullName}</Link></td>
                  <td>{best ? `${formatNumber(best.score ?? 0)} / ${formatNumber(best.maxScore ?? 0)}` : "—"}</td>
                  <td>{best?.maxScore ? formatPercent((best.score ?? 0) / best.maxScore) : "—"}</td>
                  <td className="text-xs text-muted">{best?.submittedAt ? formatDateTime(best.submittedAt) : "—"}</td>
                  <td>
                    {best ? <Badge tone={best.status === "TIMED_OUT" ? "warn" : "good"}>{r.attemptStatus[best.status]}</Badge>
                      : inProgress ? <Badge tone="accent">{r.attemptStatus.IN_PROGRESS}</Badge>
                      : <Badge>{r.notAttempted}</Badge>}
                  </td>
                  <td>{best && <Link className="text-accent hover:underline" href={`/master/exams/${id}/results/${best.id}`}>{r.viewAttempt}</Link>}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>
      <Card title={r.perQuestion}>
        {analytics.questions.length === 0 ? (
          <p className="text-sm text-muted">{r.empty}</p>
        ) : (
          <ul className="space-y-4">
            {analytics.questions.map((q) => (
              <li key={q.examQuestionId}>
                <AccuracyBar label={q.title} value={q.accuracy} sublabel={`${toFaDigits(q.correct)} / ${toFaDigits(q.total)}`} />
                <p className="mt-1 text-xs text-muted">
                  {r.avgTime}: {formatDuration(q.avgTimeMs)}
                  {q.topWrong ? ` · ${r.topWrong}: ${q.topWrong.text} (${formatPercent(q.topWrong.share)})` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
