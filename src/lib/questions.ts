import { generateCandles } from "@/lib/candles";
import type { PublicQuestion, Question } from "@/types/question";

/**
 * Seed questions. Server-side only — this module must never be imported
 * from a 'use client' component, since `correctAnswer`, `explanation` and
 * `revealCandles` must not reach the browser before submit.
 */
const HOUR = 60 * 60 * 1000;
const SETUP_START = Date.UTC(2026, 0, 1, 0, 0, 0);

const setupCandlesUp = generateCandles(60, 100, SETUP_START, HOUR, 1, 0, 1.2);
const setupCandlesDown = generateCandles(60, 100, SETUP_START, HOUR, 2, 0, 1.2);

const SEED_QUESTIONS: Question[] = [
  {
    id: "eurusd-bullish-engulfing",
    title: "EUR/USD — 1H Bullish Engulfing",
    symbol: "EURUSD",
    description:
      "A bullish engulfing candle just formed at the end of this chart. Based on the price action so far, will the next few candles go up or down?",
    candles: setupCandlesUp,
    revealCandles: generateCandles(
      12,
      setupCandlesUp[setupCandlesUp.length - 1].close,
      setupCandlesUp[setupCandlesUp.length - 1].timestamp + HOUR,
      HOUR,
      11,
      0.6,
      1.2,
    ),
    allowedTools: ["horizontalStraightLine", "straightLine", "fibonacciLine"],
    correctAnswer: "up",
    explanation:
      "Price continued higher after the bullish engulfing candle, confirming buying pressure took over at that level.",
  },
  {
    id: "btcusdt-support-break",
    title: "BTC/USDT — 15m Support Retest",
    symbol: "BTCUSDT",
    description:
      "Price is retesting a support zone it has bounced off twice before. Will it hold again, or break down?",
    candles: setupCandlesDown,
    revealCandles: generateCandles(
      12,
      setupCandlesDown[setupCandlesDown.length - 1].close,
      setupCandlesDown[setupCandlesDown.length - 1].timestamp + HOUR,
      HOUR,
      22,
      -0.7,
      1.2,
    ),
    allowedTools: ["horizontalStraightLine", "rayLine"],
    correctAnswer: "down",
    explanation:
      "The support zone failed on the third test — price broke below it instead of bouncing again.",
  },
];

export function getQuestion(id: string): Question | undefined {
  return SEED_QUESTIONS.find((q) => q.id === id);
}

export function listQuestions(): Question[] {
  return SEED_QUESTIONS;
}

export function toPublicQuestion(question: Question): PublicQuestion {
  return {
    id: question.id,
    title: question.title,
    symbol: question.symbol,
    description: question.description,
    candles: question.candles,
    allowedTools: question.allowedTools,
  };
}
