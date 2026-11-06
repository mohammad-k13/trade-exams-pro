// The only path from secret question data to a student. Every field is copied explicitly, so a new
// column or snapshot field can never reach the browser by accident. tests/leak.test.ts enforces this.
import { TIMEFRAMES, pricePrecision, type Candle } from "@/lib/candles";
import type { Drawing, GradingDetail } from "@/lib/grading";
import type { QuestionSnapshot } from "./snapshot";

/** Anonymised charts all start here, so the timestamps say nothing about the real date. */
const ANON_BASE = Date.UTC(2000, 0, 3);

export interface StudentRule {
  horizon?: number;
  sidewaysPct?: number;
  tolerancePct?: number;
  minTouches?: number;
}

export interface StudentQuestion {
  examQuestionId: string;
  type: QuestionSnapshot["type"];
  prompt: string;
  /** Null when anonymised. */
  symbol: string | null;
  timeframe: string;
  anonymized: boolean;
  candles: Candle[];
  precision: number;
  allowedTools: string[];
  options: { id: string; text: string }[] | null;
  points: number;
  rule: StudentRule;
}

export function anonymizeCandles(candles: Candle[], timeframe: string): Candle[] {
  const step = TIMEFRAMES[timeframe] ?? 3_600_000;
  return candles.map((c, i) => ({
    timestamp: ANON_BASE + i * step,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume,
  }));
}

function ruleFor(s: QuestionSnapshot): StudentRule {
  const k = s.answerKey;
  switch (k.type) {
    case "DIRECTION":
      return { horizon: k.horizon, sidewaysPct: k.sidewaysPct };
    case "DRAW_LEVEL":
      return { tolerancePct: k.tolerancePct };
    case "DRAW_TRENDLINE":
      return { tolerancePct: k.tolerancePct, minTouches: k.minTouches };
    case "MULTIPLE_CHOICE":
      return {};
  }
}

export function toStudentQuestion(
  s: QuestionSnapshot,
  examQuestionId: string,
  points: number,
  optionOrder: string[] | undefined,
): StudentQuestion {
  let options: { id: string; text: string }[] | null = null;
  if (s.options) {
    const byId = new Map(s.options.map((o) => [o.id, o]));
    const ids = optionOrder?.length ? optionOrder : s.options.map((o) => o.id);
    options = ids.flatMap((id) => {
      const o = byId.get(id);
      return o ? [{ id: o.id, text: o.text }] : [];
    });
  }
  return {
    examQuestionId,
    type: s.type,
    prompt: s.prompt,
    symbol: s.anonymize ? null : s.symbol,
    timeframe: s.timeframe,
    anonymized: s.anonymize,
    candles: s.anonymize
      ? anonymizeCandles(s.visibleCandles, s.timeframe)
      : s.visibleCandles.map((c) => ({ timestamp: c.timestamp, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume })),
    precision: pricePrecision(s.visibleCandles),
    allowedTools: [...s.allowedTools],
    options,
    points,
    rule: ruleFor(s),
  };
}

/** Only for a student whose review is allowed, or for the master. */
export interface ReviewQuestion {
  examQuestionId: string;
  type: QuestionSnapshot["type"];
  prompt: string;
  explanation: string;
  symbol: string;
  timeframe: string;
  visibleCandles: Candle[];
  futureCandles: Candle[];
  precision: number;
  options: { id: string; text: string }[] | null;
  topics: { id: string; name: string }[];
  points: number;
  earned: number;
  isCorrect: boolean;
  answered: boolean;
  response: unknown;
  detail: GradingDetail | null;
  /** The reference drawing, to overlay on the chart. */
  answerLevel: number | null;
  answerLine: [{ index: number; price: number }, { index: number; price: number }] | null;
  pivots: { index: number; price: number }[];
  studentDrawings: Drawing[];
}

export function toReviewQuestion(
  s: QuestionSnapshot,
  examQuestionId: string,
  points: number,
  answer: { response: unknown; isCorrect: boolean | null; points: number | null; gradingDetail: unknown } | undefined,
): ReviewQuestion {
  const key = s.answerKey;
  const response = (answer?.response ?? null) as { kind?: string; drawings?: Drawing[] } | null;
  return {
    examQuestionId,
    type: s.type,
    prompt: s.prompt,
    explanation: s.explanation,
    symbol: s.symbol,
    timeframe: s.timeframe,
    visibleCandles: s.visibleCandles,
    futureCandles: s.futureCandles,
    precision: pricePrecision(s.visibleCandles),
    options: s.options,
    topics: s.topics,
    points,
    earned: answer?.points ?? 0,
    isCorrect: answer?.isCorrect ?? false,
    answered: !!response && response.kind !== "none",
    response,
    detail: (answer?.gradingDetail ?? null) as GradingDetail | null,
    answerLevel: key.type === "DRAW_LEVEL" ? key.price : null,
    answerLine: key.type === "DRAW_TRENDLINE" ? key.line : null,
    pivots: key.type === "DRAW_TRENDLINE" ? key.pivots : [],
    studentDrawings: response?.drawings ?? [],
  };
}
