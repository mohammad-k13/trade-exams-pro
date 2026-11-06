import Link from "next/link";
import { Badge, Card, Empty, LinkButton, PageHeader } from "@/components/ui";
import { formatDateTime, formatNumber, formatPercent, toFaDigits } from "@/lib/format";
import { t } from "@/lib/i18n";
import { studentDashboard } from "@/server/attempts";
import { requireStudent } from "@/server/session";

const s = t.student;
export const metadata = { title: s.title };

type Row = Awaited<ReturnType<typeof studentDashboard>>[number];

function ExamCard({ exam }: { exam: Row }) {
  const open = exam.displayStatus === "active";
  const attemptsLeft = exam.attemptsUsed < exam.maxAttempts;
  return (
    <li className="rounded-xl border border-line p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={`/student/exams/${exam.id}`} className="font-medium hover:underline">{exam.title}</Link>
          <p className="mt-1.5 text-xs leading-6 text-muted">
            {s.startsAt}: {formatDateTime(exam.startsAt)}
            <br />
            {s.endsAt}: {formatDateTime(exam.endsAt)}
          </p>
          <p className="mt-1 text-xs text-muted">
            {toFaDigits(exam.durationMinutes)} {t.common.minutes} · {s.attemptsUsed(toFaDigits(exam.attemptsUsed), toFaDigits(exam.maxAttempts))}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {exam.score && exam.score.maxScore ? (
            <Badge tone="accent">
              {formatNumber(exam.score.score ?? 0)} / {formatNumber(exam.score.maxScore)} ({formatPercent((exam.score.score ?? 0) / exam.score.maxScore)})
            </Badge>
          ) : null}
          {open && exam.inProgressId && <LinkButton href={`/student/attempts/${exam.inProgressId}`}>{s.resume}</LinkButton>}
          {open && !exam.inProgressId && attemptsLeft && (
            <LinkButton href={`/student/exams/${exam.id}`}>{exam.attemptsUsed ? s.retake : s.start}</LinkButton>
          )}
          {exam.canReview && exam.lastFinishedId && (
            <LinkButton variant="secondary" href={`/student/attempts/${exam.lastFinishedId}/result`}>{s.viewResult}</LinkButton>
          )}
          {exam.displayStatus === "closed" && exam.attemptsUsed === 0 && <Badge>{s.missed}</Badge>}
          {!exam.canReview && exam.lastFinishedId && !exam.inProgressId && open && !attemptsLeft && <Badge tone="good">{s.submittedWaiting}</Badge>}
        </div>
      </div>
    </li>
  );
}

function Section({ title, rows }: { title: string; rows: Row[] }) {
  if (!rows.length) return null;
  return (
    <Card title={title}>
      <ul className="space-y-3">
        {rows.map((e) => <ExamCard key={e.id} exam={e} />)}
      </ul>
    </Card>
  );
}

export default async function StudentHome() {
  const exams = await studentDashboard(await requireStudent());
  return (
    <>
      <PageHeader title={s.title} />
      {exams.length === 0 ? (
        <Empty title={s.empty} hint={s.emptyHint} />
      ) : (
        <div className="max-w-3xl space-y-5">
          <Section title={s.active} rows={exams.filter((e) => e.displayStatus === "active")} />
          <Section title={s.upcoming} rows={exams.filter((e) => e.displayStatus === "scheduled")} />
          <Section title={s.finished} rows={exams.filter((e) => e.displayStatus === "closed").reverse()} />
        </div>
      )}
    </>
  );
}
