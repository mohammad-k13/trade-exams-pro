import type { Candle } from "@/lib/candles";
import type { AnswerKey } from "@/lib/grading";

/** Frozen copy of a question, stored on ExamQuestion when the exam is published. Contains secrets. */
export interface QuestionSnapshot {
  type: "MULTIPLE_CHOICE" | "DIRECTION" | "DRAW_LEVEL" | "DRAW_TRENDLINE";
  title: string;
  prompt: string;
  explanation: string;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  symbol: string;
  timeframe: string;
  anonymize: boolean;
  visibleCandles: Candle[];
  futureCandles: Candle[];
  allowedTools: string[];
  options: { id: string; text: string }[] | null;
  answerKey: AnswerKey;
  topics: { id: string; name: string }[];
}
