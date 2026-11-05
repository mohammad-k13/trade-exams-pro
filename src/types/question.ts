export type DrawingTool =
  | "horizontalStraightLine"
  | "straightLine"
  | "rayLine"
  | "fibonacciLine"
  | "parallelStraightLine"
  | "priceChannelLine";

export type Direction = "up" | "down";

export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  [key: string]: unknown;
}

/** Full question record. Lives server-side only — never import this into client code. */
export interface Question {
  id: string;
  title: string;
  symbol: string;
  description: string;
  /** Candles visible to the student before they submit an answer. */
  candles: Candle[];
  /** Candles appended after submit, during the reveal. */
  revealCandles: Candle[];
  allowedTools: DrawingTool[];
  correctAnswer: Direction;
  explanation: string;
}

/** What the client is allowed to see before submitting. */
export type PublicQuestion = Pick<
  Question,
  "id" | "title" | "symbol" | "description" | "candles" | "allowedTools"
>;

export interface SubmitResponse {
  isCorrect: boolean;
  correctAnswer: Direction;
  explanation: string;
  revealCandles: Candle[];
}
