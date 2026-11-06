import { notFound } from "next/navigation";
import { closeExamAction, deleteExamAction } from "@/app/actions/master";
import { ExamBuilder } from "@/components/master/exam-builder";
import { Badge, Card, LinkButton, PageHeader, type Tone } from "@/components/ui";
import { ConfirmButton } from "@/components/ui/client";
import { formatDateTime, toFaDigits } from "@/lib/format";
import { t } from "@/lib/i18n";
import { NotFoundError } from "@/server/errors";
import { assignedStudents, getExam } from "@/server/exams";
import { requireMaster } from "@/server/session";
import { loadBuilderOptions } from "../load-builder";

const e = t.exams;
const TONE: Record<string, Tone> = { draft: "neutral", scheduled: "warn", active: "accent", closed: "good" };

export default async function ExamPage({ params }: { params: Promise<{ id: string }> }) {
  const master = await requireMaster();
  const { id } = await params;
  const exam = await getExam(master, id).catch((err) => {
    if (err instanceof NotFoundError) notFound();
    throw err;
  });
  const deleteMessage = exam._count.attempts ? e.deleteWithAttemptsConfirm : e.deleteConfirm;
  const remove = <ConfirmButton label={t.common.delete} message={deleteMessage} action={deleteExamAction.bind(null, id)} />;

  if (exam.status === "DRAFT") {
    const options = await loadBuilderOptions(master);
    return (
      <>
        <PageHeader title={exam.title} action={<><Badge>{e.status.draft}</Badge>{remove}</>} />
        <ExamBuilder
          {...options}
          // eslint-disable-next-line react-hooks/purity -- server component; used only for default dates
          now={Date.now()}
          initial={{
            id,
            title: exam.title,
            description: exam.description,
            durationMinutes: exam.durationMinutes,
            startsAt: exam.startsAt.toISOString(),
            endsAt: exam.endsAt.toISOString(),
            maxAttempts: exam.maxAttempts,
            shuffleQuestions: exam.shuffleQuestions,
            shuffleOptions: exam.shuffleOptions,
            reviewPolicy: exam.reviewPolicy,
            reviewAt: exam.reviewAt?.toISOString() ?? null,
            questions: exam.questions.map((q) => ({ id: q.questionId, points: q.points })),
            groupIds: exam.groups.map((g) => g.groupId),
            studentIds: exam.students.map((s) => s.userId),
          }}
        />
      </>
    );
  }

  const students = await assignedStudents(id);
  const canClose = exam.displayStatus === "active" || exam.displayStatus === "scheduled";
  return (
    <>
      <PageHeader
        title={exam.title}
        subtitle={exam.description}
        action={
          <>
            <LinkButton href={`/master/exams/${id}/results`}>{e.results}</LinkButton>
            {canClose && <ConfirmButton label={e.close} message={e.closeConfirm} action={closeExamAction.bind(null, id)} />}
            {remove}
          </>
        }
      />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title={t.common.details}>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 text-sm [&_dt]:text-muted">
            <dt>{t.students.status}</dt>
            <dd><Badge tone={TONE[exam.displayStatus]}>{e.status[exam.displayStatus]}</Badge></dd>
            <dt>{e.fields.startsAt}</dt>
            <dd>{formatDateTime(exam.startsAt)}</dd>
            <dt>{e.fields.endsAt}</dt>
            <dd>{formatDateTime(exam.closedAt && exam.closedAt < exam.endsAt ? exam.closedAt : exam.endsAt)}</dd>
            <dt>{e.fields.duration}</dt>
            <dd>{toFaDigits(exam.durationMinutes)}</dd>
            <dt>{e.fields.maxAttempts}</dt>
            <dd>{toFaDigits(exam.maxAttempts)}</dd>
            <dt>{e.fields.reviewPolicy}</dt>
            <dd>{e.review[exam.reviewPolicy]}</dd>
            <dt>{e.assign}</dt>
            <dd>{toFaDigits(e.assignedCount(students.length))}</dd>
          </dl>
        </Card>
        <Card title={e.pickQuestions}>
          <ol className="space-y-2 text-sm">
            {exam.questions.map((q, i) => (
              <li key={q.questionId} className="flex justify-between gap-3">
                <span>{toFaDigits(i + 1)}. {q.question.title}</span>
                <span className="shrink-0 text-muted">{toFaDigits(q.points)} {t.common.points}</span>
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </>
  );
}
