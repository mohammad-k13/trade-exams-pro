import { notFound } from "next/navigation";
import { ReviewView } from "@/components/review";
import { NotFoundError } from "@/server/errors";
import { getMasterAttemptReview } from "@/server/results";
import { requireMaster } from "@/server/session";

export default async function MasterAttemptPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const master = await requireMaster();
  const { attemptId } = await params;
  const review = await getMasterAttemptReview(master, attemptId).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  return <ReviewView {...review} />;
}
