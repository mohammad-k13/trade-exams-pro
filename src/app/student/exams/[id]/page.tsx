import { notFound } from "next/navigation";
import { StartExamButton } from "@/components/student/start-button";
import { Alert, Card, LinkButton, PageHeader } from "@/components/ui";
import { formatDateTime, toFaDigits } from "@/lib/format";
import { t } from "@/lib/i18n";
import { examLanding } from "@/server/attempts";
import { NotFoundError } from "@/server/errors";
import { requireStudent } from "@/server/session";

const s = t.student;

export default async function ExamLandingPage({ params }: { params: Promise<{ id: string }> }) {
  const student = await requireStudent();
  const { id } = await params;
  const exam = await examLanding(student, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const attemptsLeft = exam.attemptsUsed < exam.maxAttempts;
  return (
    <div className="max-w-2xl">
      <PageHeader title={exam.title} subtitle={exam.description} />
      <Card title={s.instructionsTitle}>
        <dl className="mb-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm [&_dt]:text-muted">
          <dt>{t.exams.pickQuestions}</dt>
          <dd>{toFaDigits(t.exams.questionsCount(exam.questionCount))}</dd>
          <dt>{t.exams.fields.duration}</dt>
          <dd>{toFaDigits(exam.durationMinutes)}</dd>
          <dt>{s.startsAt}</dt>
          <dd>{formatDateTime(exam.startsAt)}</dd>
          <dt>{s.endsAt}</dt>
          <dd>{formatDateTime(exam.endsAt)}</dd>
          <dt>{t.exams.fields.maxAttempts}</dt>
          <dd>{s.attemptsUsed(toFaDigits(exam.attemptsUsed), toFaDigits(exam.maxAttempts))}</dd>
        </dl>
        <ul className="mb-5 list-disc space-y-1.5 ps-5 text-sm leading-6">
          {s.instructions(toFaDigits(exam.durationMinutes)).map((line) => <li key={line}>{line}</li>)}
        </ul>
        {exam.inProgressId ? (
          <LinkButton href={`/student/attempts/${exam.inProgressId}`}>{s.resume}</LinkButton>
        ) : exam.displayStatus === "scheduled" ? (
          <Alert tone="warn">{s.notStarted}</Alert>
        ) : exam.displayStatus === "closed" ? (
          <Alert tone="neutral">{s.closed}</Alert>
        ) : attemptsLeft ? (
          <StartExamButton examId={exam.id} label={exam.attemptsUsed ? s.retake : s.start} />
        ) : (
          <Alert tone="neutral">{s.noAttemptsLeft}</Alert>
        )}
        {exam.canReview && exam.lastFinishedId && (
          <div className="mt-3">
            <LinkButton variant="secondary" href={`/student/attempts/${exam.lastFinishedId}/result`}>{s.viewResult}</LinkButton>
          </div>
        )}
      </Card>
    </div>
  );
}
