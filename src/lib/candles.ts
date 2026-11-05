import type { Candle } from "@/types/question";

/** Deterministic PRNG so seed data is stable across reloads/deploys. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generates a synthetic random-walk candle series for demo purposes.
 * `drift` biases each step up or down, used to make the reveal section
 * trend in the question's correct direction.
 */
export function generateCandles(
  count: number,
  startPrice: number,
  startTimestamp: number,
  intervalMs: number,
  seed: number,
  drift = 0,
  volatility = 1,
): Candle[] {
  const rng = mulberry32(seed);
  const candles: Candle[] = [];
  let price = startPrice;

  for (let i = 0; i < count; i++) {
    const open = price;
    const change = (rng() - 0.5) * volatility + drift;
    const close = Math.max(0.01, open + change);
    const high = Math.max(open, close) + rng() * volatility * 0.5;
    const low = Math.max(0.01, Math.min(open, close) - rng() * volatility * 0.5);
    const volume = Math.round(100 + rng() * 900);

    candles.push({
      timestamp: startTimestamp + i * intervalMs,
      open: round2(open),
      high: round2(high),
      low: round2(low),
      close: round2(close),
      volume,
    });

    price = close;
  }

  return candles;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
