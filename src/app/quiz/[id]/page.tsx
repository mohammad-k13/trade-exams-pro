import QuizClient from "@/components/QuizClient";

export default async function QuizPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <QuizClient questionId={id} />
    </main>
  );
}
