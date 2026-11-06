// Pure grading rules. No I/O, so they run in tests exactly as in production.
// The rules are documented for humans in docs/decisions.md.
import { findPivots, type Candle, type Pivot } from "@/lib/candles";

export type Direction = "up" | "down" | "sideways";

export type AnswerKey =
  | { type: "MULTIPLE_CHOICE"; correctOptionId: string }
  | { type: "DIRECTION"; horizon: number; sidewaysPct: number }
  | { type: "DRAW_LEVEL"; price: number; tolerancePct: number }
  | {
      type: "DRAW_TRENDLINE";
      /** The master's reference line, shown in review. */
      line: [DrawPoint, DrawPoint];
      pivots: DrawPoint[];
      minTouches: number;
      tolerancePct: number;
    };

/** Index is the candle position in the visible series, so grading is independent of timestamps. */
export interface DrawPoint {
  index: number;
  price: number;
}

export interface Drawing {
  tool: string;
  points: DrawPoint[];
}

export type StudentResponse =
  | { kind: "option"; optionId: string }
  | { kind: "direction"; direction: Direction }
  | { kind: "draw"; drawings: Drawing[] }
  | { kind: "none"; drawings?: Drawing[] };

export type GradingDetail =
  | { kind: "option"; chosen: string | null; correct: string }
  | { kind: "direction"; chosen: Direction | null; correct: Direction; changePct: number; horizon: number; sidewaysPct: number }
  | { kind: "level"; drawn: number | null; target: number; distancePct: number | null; tolerancePct: number }
  | {
      kind: "trendline";
      line: [DrawPoint, DrawPoint] | null;
      touched: number;
      required: number;
      total: number;
      tolerancePct: number;
    };

export interface GradeResult {
  isCorrect: boolean;
  detail: GradingDetail;
}

export const LEVEL_TOOLS = ["horizontalStraightLine", "horizontalRayLine", "horizontalSegment", "priceLine"];
export const LINE_TOOLS = ["straightLine", "rayLine", "segment"];

export interface GradableQuestion {
  answerKey: AnswerKey;
  visibleCandles: Candle[];
  futureCandles: Candle[];
}

export function directionOutcome(
  visible: Candle[],
  future: Candle[],
  horizon: number,
  sidewaysPct: number,
): { direction: Direction; changePct: number } {
  const base = visible.at(-1)?.close;
  const target = future[Math.min(horizon, future.length) - 1]?.close;
  if (base === undefined || target === undefined || base <= 0) {
    throw new Error("Direction question has no usable candles");
  }
  const changePct = ((target - base) / base) * 100;
  const direction: Direction = changePct > sidewaysPct ? "up" : changePct < -sidewaysPct ? "down" : "sideways";
  return { direction, changePct };
}

/** Price of a line at a candle index; null when the index is outside the tool's extent. */
export function lineValueAt(tool: string, a: DrawPoint, b: DrawPoint, index: number): number | null {
  if (a.index === b.index) return null;
  const lo = Math.min(a.index, b.index);
  const hi = Math.max(a.index, b.index);
  if (tool === "segment" && (index < lo || index > hi)) return null;
  if (tool === "rayLine" && (b.index > a.index ? index < a.index : index > a.index)) return null;
  return a.price + ((b.price - a.price) * (index - a.index)) / (b.index - a.index);
}

/** The master's pivots: swing points the reference line passes within tolerance of. */
export function pivotsOnLine(visible: Candle[], line: [DrawPoint, DrawPoint], tolerancePct: number): Pivot[] {
  return findPivots(visible).filter((p) => {
    const value = lineValueAt("straightLine", line[0], line[1], p.index);
    return value !== null && (Math.abs(value - p.price) / p.price) * 100 <= tolerancePct;
  });
}

function lastDrawing(drawings: Drawing[] | undefined, tools: string[], minPoints: number): Drawing | null {
  const list = (drawings ?? []).filter((d) => tools.includes(d.tool) && d.points.length >= minPoints);
  return list.at(-1) ?? null;
}

export function grade(q: GradableQuestion, response: StudentResponse | null): GradeResult {
  const key = q.answerKey;
  switch (key.type) {
    case "MULTIPLE_CHOICE": {
      const chosen = response?.kind === "option" ? response.optionId : null;
      return { isCorrect: chosen === key.correctOptionId, detail: { kind: "option", chosen, correct: key.correctOptionId } };
    }
    case "DIRECTION": {
      const outcome = directionOutcome(q.visibleCandles, q.futureCandles, key.horizon, key.sidewaysPct);
      const chosen = response?.kind === "direction" ? response.direction : null;
      return {
        isCorrect: chosen === outcome.direction,
        detail: {
          kind: "direction",
          chosen,
          correct: outcome.direction,
          changePct: outcome.changePct,
          horizon: key.horizon,
          sidewaysPct: key.sidewaysPct,
        },
      };
    }
    case "DRAW_LEVEL": {
      const drawing = response?.kind === "draw" ? lastDrawing(response.drawings, LEVEL_TOOLS, 1) : null;
      const drawn = drawing?.points[0]?.price ?? null;
      const distancePct = drawn === null ? null : (Math.abs(drawn - key.price) / key.price) * 100;
      return {
        isCorrect: distancePct !== null && distancePct <= key.tolerancePct,
        detail: { kind: "level", drawn, target: key.price, distancePct, tolerancePct: key.tolerancePct },
      };
    }
    case "DRAW_TRENDLINE": {
      const drawing = response?.kind === "draw" ? lastDrawing(response.drawings, LINE_TOOLS, 2) : null;
      let touched = 0;
      let line: [DrawPoint, DrawPoint] | null = null;
      if (drawing) {
        const [a, b] = drawing.points;
        line = [a, b];
        for (const pivot of key.pivots) {
          const value = lineValueAt(drawing.tool, a, b, pivot.index);
          if (value !== null && (Math.abs(value - pivot.price) / pivot.price) * 100 <= key.tolerancePct) touched++;
        }
      }
      return {
        isCorrect: touched >= key.minTouches,
        detail: {
          kind: "trendline",
          line,
          touched,
          required: key.minTouches,
          total: key.pivots.length,
          tolerancePct: key.tolerancePct,
        },
      };
    }
  }
}
