import { notFound, redirect } from "next/navigation";
import { ReviewView } from "@/components/review";
import { Alert, Card, LinkButton, PageHeader } from "@/components/ui";
import { formatDateTime, formatNumber } from "@/lib/format";
import { t } from "@/lib/i18n";
import { getStudentReview } from "@/server/attempts";
import { NotFoundError } from "@/server/errors";
import { requireStudent } from "@/server/session";

const s = t.student;

export default async function ResultPage({ params }: { params: Promise<{ id: string }> }) {
  const student = await requireStudent();
  const { id } = await params;
  const review = await getStudentReview(student, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  if (review.allowed) {
    return <ReviewView {...review} />;
  }
  if (review.reason === "in_progress") redirect(`/student/attempts/${id}`);
  const message =
    review.reason === "never" ? s.resultNever
    : review.reason === "at_time" && review.reviewAt ? s.resultAt(formatDateTime(review.reviewAt))
    : review.reason === "after_attempts" ? s.resultAfterAttempts
    : s.resultAfterClose;
  return (
    <div className="max-w-xl">
      <PageHeader title={review.examTitle} />
      <Card>
        <Alert tone="good">{s.submittedWaiting}</Alert>
        <p className="mt-3 text-sm leading-6 text-muted">{message}</p>
        {review.score && (
          <p className="mt-3 text-sm">{t.result.score}: <strong>{formatNumber(review.score.score ?? 0)} / {formatNumber(review.score.maxScore ?? 0)}</strong></p>
        )}
        <div className="mt-4"><LinkButton variant="secondary" href="/student">{t.nav.myExams}</LinkButton></div>
      </Card>
    </div>
  );
}
