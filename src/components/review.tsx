"use client";

import { useMemo } from "react";
import { CandleChart, type ReferenceOverlay } from "@/components/chart/candle-chart";
import { AccuracyBar } from "@/components/charts";
import { Badge, Button, Card, Stat } from "@/components/ui";
import { formatDateTime, formatNumber, formatPercent, toFaDigits } from "@/lib/format";
import type { Direction, GradingDetail } from "@/lib/grading";
import { t } from "@/lib/i18n";
import type { ReviewQuestion } from "@/server/dto";
import type { TopicStat } from "@/server/attempts";

const r = t.result;

function evidenceText(d: GradingDetail | null, precision: number): string | null {
  const num = (n: number) => formatNumber(n, precision);
  if (!d) return null;
  if (d.kind === "level") {
    if (d.drawn === null || d.distancePct === null) return r.noLine;
    return r.evidenceLevel(num(d.drawn), num(d.target), formatNumber(d.distancePct, 3), formatNumber(d.tolerancePct, 3));
  }
  if (d.kind === "trendline") {
    if (!d.line) return r.noLine;
    return r.evidenceLine(toFaDigits(d.touched), toFaDigits(d.required), toFaDigits(d.total), formatNumber(d.tolerancePct, 3));
  }
  if (d.kind === "direction") {
    return r.evidenceDirection(toFaDigits(d.horizon), formatNumber(d.changePct), formatNumber(d.sidewaysPct));
  }
  return null;
}

function answerTexts(q: ReviewQuestion) {
  const d = q.detail;
  if (d?.kind === "option") {
    const text = (id: string | null) => q.options?.find((o) => o.id === id)?.text ?? r.noAnswer;
    return { mine: text(d.chosen), correct: text(d.correct) };
  }
  if (d?.kind === "direction") {
    const text = (x: Direction | null) => (x ? t.direction[x] : r.noAnswer);
    return { mine: text(d.chosen), correct: text(d.correct) };
  }
  return null;
}

function QuestionReview({ q, n }: { q: ReviewQuestion; n: number }) {
  const candles = useMemo(() => [...q.visibleCandles, ...q.futureCandles], [q.visibleCandles, q.futureCandles]);
  const references = useMemo<ReferenceOverlay[]>(() => {
    const list: ReferenceOverlay[] = [{ kind: "boundary", index: q.visibleCandles.length - 1, color: "#a16207" }];
    if (q.answerLevel) {
      list.push({ kind: "level", price: q.answerLevel, color: "#15803d" });
      const d = q.detail;
      if (d?.kind === "level") {
        const band = (q.answerLevel * d.tolerancePct) / 100;
        list.push({ kind: "band", band: [q.answerLevel - band, q.answerLevel + band], color: "#86efac" });
      }
    }
    if (q.answerLine) list.push({ kind: "line", points: q.answerLine, color: "#15803d" });
    for (const p of q.pivots) list.push({ kind: "pivot", points: [p], color: "#15803d" });
    return list;
  }, [q]);
  const texts = answerTexts(q);
  const evidence = evidenceText(q.detail, q.precision);

  return (
    <Card className="print-break">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-muted">{t.attempt.question(toFaDigits(n), "").replace(/ از $/, "")}</h3>
        <div className="flex items-center gap-2">
          {q.isCorrect ? <Badge tone="good">✓ {r.correct}</Badge> : q.answered ? <Badge tone="bad">✕ {r.incorrect}</Badge> : <Badge>{r.unanswered}</Badge>}
          <Badge>{formatNumber(q.earned)} / {formatNumber(q.points)} {t.common.points}</Badge>
        </div>
      </div>
      <p className="mb-2 leading-7 whitespace-pre-line">{q.prompt}</p>
      <p className="mb-3 text-xs text-muted">{r.symbolReveal(q.symbol, q.timeframe)}</p>
      <CandleChart
        candles={candles}
        timeframe={q.timeframe}
        precision={q.precision}
        drawings={q.studentDrawings}
        references={references}
        height={320}
        ariaLabel={q.prompt}
      />
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <li><span aria-hidden className="me-1 inline-block h-0.5 w-4 bg-[#a16207] align-middle" />{t.chart.boundary}</li>
        {q.studentDrawings.length > 0 && <li><span aria-hidden className="me-1 inline-block h-0.5 w-4 bg-accent align-middle" />{t.chart.yourLine}</li>}
        {(q.answerLevel || q.answerLine) && <li><span aria-hidden className="me-1 inline-block h-0.5 w-4 bg-good align-middle" />{t.chart.correctLine}</li>}
        {q.answerLevel && <li><span aria-hidden className="me-1 inline-block h-0.5 w-4 bg-[#86efac] align-middle" />{t.chart.toleranceBand}</li>}
        {q.pivots.length > 0 && <li><span aria-hidden className="me-1 text-good">●</span>{t.chart.pivot}</li>}
      </ul>
      <dl className="mt-4 space-y-2 text-sm leading-6">
        {texts && (
          <>
            <div className="flex gap-2"><dt className="shrink-0 text-muted">{r.yourAnswer}:</dt><dd>{texts.mine}</dd></div>
            <div className="flex gap-2"><dt className="shrink-0 text-muted">{r.correctAnswer}:</dt><dd className="font-medium">{texts.correct}</dd></div>
          </>
        )}
        {evidence && <div className="flex gap-2"><dt className="shrink-0 text-muted">{r.evidence}:</dt><dd>{evidence}</dd></div>}
        {q.explanation && <div className="flex gap-2"><dt className="shrink-0 text-muted">{r.explanation}:</dt><dd className="whitespace-pre-line">{q.explanation}</dd></div>}
      </dl>
    </Card>
  );
}

export function ReviewView({
  examTitle,
  studentName,
  score,
  maxScore,
  status,
  submittedAt,
  questions,
  topics,
}: {
  examTitle: string;
  studentName: string;
  score: number;
  maxScore: number;
  status: string;
  submittedAt: Date | string | null;
  questions: ReviewQuestion[];
  topics: TopicStat[];
}) {
  const correct = questions.filter((q) => q.isCorrect).length;
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">{r.title}: {examTitle}</h1>
          <p className="mt-1 text-sm text-muted">
            {studentName}
            {submittedAt ? ` · ${formatDateTime(submittedAt)}` : ""}
            {status === "TIMED_OUT" ? ` · ${r.timedOut}` : ""}
          </p>
        </div>
        <Button variant="secondary" className="no-print" onClick={() => window.print()}>{t.common.print}</Button>
      </header>
      <div className="grid grid-cols-3 gap-3">
        <Stat label={r.score} value={`${formatNumber(score)} / ${formatNumber(maxScore)}`} />
        <Stat label={r.percent} value={maxScore ? formatPercent(score / maxScore) : "—"} />
        <Stat label={r.correct} value={`${toFaDigits(correct)} / ${toFaDigits(questions.length)}`} />
      </div>
      {topics.length > 0 && (
        <Card title={r.topicStrengths} className="print-break">
          <ul className="space-y-3">
            {topics.map((x) => (
              <li key={x.id}><AccuracyBar label={x.name} value={x.correct / x.total} sublabel={`${toFaDigits(x.correct)} / ${toFaDigits(x.total)}`} /></li>
            ))}
          </ul>
        </Card>
      )}
      {questions.map((q, i) => <QuestionReview key={q.examQuestionId} q={q} n={i + 1} />)}
    </div>
  );
}
