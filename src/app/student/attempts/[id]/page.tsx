import { notFound, redirect } from "next/navigation";
import { AttemptRunner } from "@/components/student/attempt-runner";
import { getAttemptView } from "@/server/attempts";
import { NotFoundError } from "@/server/errors";
import { requireStudent } from "@/server/session";

export default async function AttemptPage({ params }: { params: Promise<{ id: string }> }) {
  const student = await requireStudent();
  const { id } = await params;
  const view = await getAttemptView(student, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  if (view.finished) redirect(`/student/attempts/${id}/result`);
  return <AttemptRunner view={view} />;
}
