import { notFound } from "next/navigation";
import { QuestionEditor, type EditorInitial } from "@/components/master/question-editor";
import { PageHeader } from "@/components/ui";
import type { Candle } from "@/lib/candles";
import type { AnswerKey } from "@/lib/grading";
import { t } from "@/lib/i18n";
import { NotFoundError } from "@/server/errors";
import { getQuestion, listTopics } from "@/server/questions";
import { requireMaster } from "@/server/session";

export const metadata = { title: t.questions.edit };

export default async function EditQuestionPage({ params }: { params: Promise<{ id: string }> }) {
  const master = await requireMaster();
  const { id } = await params;
  const question = await getQuestion(master, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const topics = await listTopics(master);
  const visible = question.visibleCandles as unknown as Candle[];
  const future = question.futureCandles as unknown as Candle[];
  const key = question.answerKey as unknown as AnswerKey;
  const initial: EditorInitial = {
    id: question.id,
    type: question.type,
    title: question.title,
    prompt: question.prompt,
    explanation: question.explanation,
    difficulty: question.difficulty,
    topics: question.topics.map((x) => x.topic.name),
    symbol: question.symbol,
    timeframe: question.timeframe,
    anonymize: question.anonymize,
    candles: [...visible, ...future],
    visibleCount: visible.length,
    allowedTools: question.allowedTools,
    options: (question.options as { id: string; text: string }[] | null) ?? [],
    correctOptionId: key.type === "MULTIPLE_CHOICE" ? key.correctOptionId : null,
    horizon: key.type === "DIRECTION" ? key.horizon : 10,
    sidewaysPct: key.type === "DIRECTION" ? key.sidewaysPct : 0.5,
    level: key.type === "DRAW_LEVEL" ? key.price : null,
    line: key.type === "DRAW_TRENDLINE" ? key.line : null,
    tolerancePct: key.type === "DRAW_LEVEL" || key.type === "DRAW_TRENDLINE" ? key.tolerancePct : 0.5,
    minTouches: key.type === "DRAW_TRENDLINE" ? key.minTouches : 2,
  };
  return (
    <>
      <PageHeader title={t.questions.edit} />
      {/* eslint-disable-next-line react-hooks/purity -- server component; used only as the default date range */}
      <QuestionEditor initial={initial} now={Date.now()} topicSuggestions={topics.map((x) => x.name)} />
    </>
  );
}
