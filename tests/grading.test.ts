import { describe, expect, it } from "vitest";
import { findPivots, parseCandlesCsv, suggestTolerancePct, type Candle } from "@/lib/candles";
import { directionOutcome, grade, lineValueAt, type AnswerKey, type GradableQuestion } from "@/lib/grading";

const candle = (close: number, i = 0): Candle => ({
  timestamp: i * 3_600_000,
  open: close,
  high: close + 1,
  low: close - 1,
  close,
  volume: 1,
});

function q(answerKey: AnswerKey, visible = [candle(100)], future = [candle(100)]): GradableQuestion {
  return { answerKey, visibleCandles: visible, futureCandles: future };
}

describe("multiple choice", () => {
  const key: AnswerKey = { type: "MULTIPLE_CHOICE", correctOptionId: "b" };
  it("accepts only the keyed option", () => {
    expect(grade(q(key), { kind: "option", optionId: "b" }).isCorrect).toBe(true);
    expect(grade(q(key), { kind: "option", optionId: "a" }).isCorrect).toBe(false);
  });
  it("marks an unanswered question incorrect", () => {
    expect(grade(q(key), null).isCorrect).toBe(false);
  });
  it("ignores a response of the wrong kind", () => {
    expect(grade(q(key), { kind: "direction", direction: "up" }).isCorrect).toBe(false);
  });
});

describe("direction", () => {
  const key: AnswerKey = { type: "DIRECTION", horizon: 2, sidewaysPct: 1 };
  const future = (close: number) => [candle(999), candle(close)];

  it("reads the close at the horizon, not the last or first future candle", () => {
    const outcome = directionOutcome([candle(100)], [candle(50), candle(103), candle(50)], 2, 1);
    expect(outcome.direction).toBe("up");
    expect(outcome.changePct).toBeCloseTo(3);
  });
  it("classifies up, down and sideways", () => {
    expect(grade(q(key, [candle(100)], future(102)), { kind: "direction", direction: "up" }).isCorrect).toBe(true);
    expect(grade(q(key, [candle(100)], future(98)), { kind: "direction", direction: "down" }).isCorrect).toBe(true);
    expect(grade(q(key, [candle(100)], future(100.5)), { kind: "direction", direction: "sideways" }).isCorrect).toBe(true);
  });
  it("treats a move exactly at the threshold as sideways", () => {
    expect(directionOutcome([candle(100)], [candle(101)], 1, 1).direction).toBe("sideways");
  });
  it("uses the last candle when the horizon runs past the data", () => {
    expect(directionOutcome([candle(100)], [candle(120)], 5, 1).direction).toBe("up");
  });
  it("throws rather than guessing when there is no future data", () => {
    expect(() => directionOutcome([candle(100)], [], 1, 1)).toThrow();
  });
});

describe("draw level", () => {
  const key: AnswerKey = { type: "DRAW_LEVEL", price: 1000, tolerancePct: 1 };
  const draw = (price: number, tool = "horizontalStraightLine") => ({
    kind: "draw" as const,
    drawings: [{ tool, points: [{ index: 5, price }] }],
  });

  it("accepts inside the tolerance on both sides, including the boundary", () => {
    expect(grade(q(key), draw(1010)).isCorrect).toBe(true);
    expect(grade(q(key), draw(990)).isCorrect).toBe(true);
  });
  it("rejects outside the tolerance and reports the distance", () => {
    const r = grade(q(key), draw(1011));
    expect(r.isCorrect).toBe(false);
    expect(r.detail).toMatchObject({ kind: "level", target: 1000 });
    if (r.detail.kind === "level") expect(r.detail.distancePct).toBeCloseTo(1.1);
  });
  it("grades the last line when several were drawn", () => {
    const response = {
      kind: "draw" as const,
      drawings: [
        { tool: "horizontalStraightLine", points: [{ index: 1, price: 1000 }] },
        { tool: "horizontalStraightLine", points: [{ index: 1, price: 1500 }] },
      ],
    };
    expect(grade(q(key), response).isCorrect).toBe(false);
  });
  it("never counts helper tools such as Fibonacci", () => {
    expect(grade(q(key), draw(1000, "fibonacciLine")).isCorrect).toBe(false);
  });
  it("marks a missing drawing incorrect", () => {
    expect(grade(q(key), { kind: "draw", drawings: [] }).isCorrect).toBe(false);
    expect(grade(q(key), null).isCorrect).toBe(false);
  });
});

describe("draw trend line", () => {
  const pivots = [
    { index: 10, price: 100 },
    { index: 20, price: 110 },
    { index: 30, price: 120 },
  ];
  const key: AnswerKey = {
    type: "DRAW_TRENDLINE",
    line: [pivots[0], pivots[2]],
    pivots,
    minTouches: 2,
    tolerancePct: 1,
  };
  const line = (tool: string, a: [number, number], b: [number, number]) => ({
    kind: "draw" as const,
    drawings: [{ tool, points: [{ index: a[0], price: a[1] }, { index: b[0], price: b[1] }] }],
  });

  it("interpolates between the student's two points", () => {
    expect(lineValueAt("straightLine", { index: 0, price: 0 }, { index: 10, price: 10 }, 5)).toBe(5);
    expect(lineValueAt("straightLine", { index: 0, price: 0 }, { index: 10, price: 10 }, 20)).toBe(20);
  });
  it("accepts a line through enough pivots", () => {
    const r = grade(q(key), line("straightLine", [10, 100], [30, 120]));
    expect(r.isCorrect).toBe(true);
    expect(r.detail).toMatchObject({ touched: 3, required: 2, total: 3 });
  });
  it("rejects a line through a single pivot", () => {
    const r = grade(q(key), line("straightLine", [10, 100], [30, 200]));
    expect(r.isCorrect).toBe(false);
    expect(r.detail).toMatchObject({ touched: 1 });
  });
  it("does not count pivots outside a segment", () => {
    expect(grade(q(key), line("segment", [10, 100], [15, 105])).detail).toMatchObject({ touched: 1 });
  });
  it("does not count pivots behind a ray's origin", () => {
    expect(grade(q(key), line("rayLine", [25, 115], [30, 120])).detail).toMatchObject({ touched: 1 });
  });
  it("handles a ray pointing left", () => {
    expect(lineValueAt("rayLine", { index: 20, price: 1 }, { index: 10, price: 1 }, 5)).toBe(1);
    expect(lineValueAt("rayLine", { index: 20, price: 1 }, { index: 10, price: 1 }, 25)).toBeNull();
  });
  it("does not crash on a vertical line", () => {
    expect(grade(q(key), line("straightLine", [10, 100], [10, 300])).isCorrect).toBe(false);
  });
});

describe("candle helpers", () => {
  it("finds a swing high and low", () => {
    const closes = [10, 11, 12, 13, 12, 11, 10, 9, 8, 9, 10, 11, 12];
    const pivots = findPivots(closes.map((c, i) => candle(c, i)), 2);
    expect(pivots).toContainEqual({ index: 3, price: 14, kind: "high" });
    expect(pivots).toContainEqual({ index: 8, price: 7, kind: "low" });
  });
  it("scales the suggested tolerance with the instrument", () => {
    const flat = (price: number, range: number) =>
      Array.from({ length: 20 }, (_, i) => ({ ...candle(price, i), high: price + range, low: price - range }));
    expect(suggestTolerancePct(flat(60000, 300))).toBeCloseTo(0.5);
    expect(suggestTolerancePct(flat(1.08, 0.001))).toBeLessThan(0.2);
  });
  it("parses CSV, sorts, and accepts seconds and ISO dates", () => {
    const r = parseCandlesCsv("time,open,high,low,close,volume\n1700003600,2,3,1,2,5\n2023-11-14T22:13:20Z,1,2,1,1,4");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.candles).toHaveLength(2);
      expect(r.candles[0].timestamp).toBe(1700000000000);
    }
  });
  it("reports a bad row by its line number", () => {
    expect(parseCandlesCsv("time,open,high,low,close\n1700000000,2,1,3,2")).toEqual({ ok: false, error: "row", row: 2 });
    expect(parseCandlesCsv("a,b\n1,2")).toEqual({ ok: false, error: "columns" });
  });
});
