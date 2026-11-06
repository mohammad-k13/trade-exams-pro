export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export const TIMEFRAMES: Record<string, number> = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "30m": 1_800_000,
  "1h": 3_600_000,
  "4h": 14_400_000,
  "1d": 86_400_000,
  "1w": 604_800_000,
};

/** Average True Range over the last `period` candles. */
export function atr(candles: Candle[], period = 14): number {
  if (candles.length < 2) return 0;
  const start = Math.max(1, candles.length - period);
  let sum = 0;
  for (let i = start; i < candles.length; i++) {
    const c = candles[i];
    const prevClose = candles[i - 1].close;
    sum += Math.max(c.high - c.low, Math.abs(c.high - prevClose), Math.abs(c.low - prevClose));
  }
  return sum / (candles.length - start);
}

/** Suggested tolerance for drawn answers: half an ATR, as a percent of the last close. */
export function suggestTolerancePct(candles: Candle[]): number {
  const last = candles.at(-1)?.close ?? 0;
  if (last <= 0) return 0.5;
  const pct = ((atr(candles) * 0.5) / last) * 100;
  return Math.max(0.01, Number(pct.toFixed(pct < 0.1 ? 3 : 2)));
}

/** Decimal places needed to display these prices. */
export function pricePrecision(candles: Candle[]): number {
  const p = candles.at(-1)?.close ?? 1;
  if (p >= 1000) return 2;
  if (p >= 1) return 4;
  return 6;
}

export interface Pivot {
  index: number;
  price: number;
  kind: "high" | "low";
}

/** Swing points: a high or low that is the extreme of `span` candles on each side. */
export function findPivots(candles: Candle[], span = 3): Pivot[] {
  const pivots: Pivot[] = [];
  for (let i = span; i < candles.length - span; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = i - span; j <= i + span; j++) {
      if (j === i) continue;
      if (candles[j].high >= candles[i].high) isHigh = false;
      if (candles[j].low <= candles[i].low) isLow = false;
    }
    if (isHigh) pivots.push({ index: i, price: candles[i].high, kind: "high" });
    if (isLow) pivots.push({ index: i, price: candles[i].low, kind: "low" });
  }
  return pivots;
}

export type CsvResult = { ok: true; candles: Candle[] } | { ok: false; error: "empty" | "columns" | "row"; row?: number };

const COLUMN_NAMES: Record<keyof Candle, string[]> = {
  timestamp: ["time", "timestamp", "date", "datetime", "open_time", "زمان", "تاریخ"],
  open: ["open", "o", "باز", "بازشدن"],
  high: ["high", "h", "سقف", "بالا"],
  low: ["low", "l", "کف", "پایین"],
  close: ["close", "c", "بسته", "بسته‌شدن"],
  volume: ["volume", "vol", "v", "حجم"],
};

function parseTime(raw: string): number {
  if (/^\d+$/.test(raw)) {
    const n = Number(raw);
    return n < 1e11 ? n * 1000 : n; // seconds or milliseconds
  }
  return Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(raw) ? raw : `${raw.replace(" ", "T")}Z`);
}

/** Parses time,open,high,low,close[,volume] with a header row. Sorted and de-duplicated by time. */
export function parseCandlesCsv(text: string): CsvResult {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { ok: false, error: "empty" };
  const sep = lines[0].includes(";") ? ";" : lines[0].includes("\t") ? "\t" : ",";
  const header = lines[0].split(sep).map((h) => h.trim().toLowerCase().replace(/^"|"$/g, ""));
  const col = (key: keyof Candle) => header.findIndex((h) => COLUMN_NAMES[key].includes(h));
  const idx = { t: col("timestamp"), o: col("open"), h: col("high"), l: col("low"), c: col("close"), v: col("volume") };
  if ([idx.t, idx.o, idx.h, idx.l, idx.c].some((i) => i < 0)) return { ok: false, error: "columns" };

  const byTime = new Map<number, Candle>();
  for (let n = 1; n < lines.length; n++) {
    const cells = lines[n].split(sep).map((c) => c.trim().replace(/^"|"$/g, ""));
    const candle: Candle = {
      timestamp: parseTime(cells[idx.t] ?? ""),
      open: Number(cells[idx.o]),
      high: Number(cells[idx.h]),
      low: Number(cells[idx.l]),
      close: Number(cells[idx.c]),
      volume: idx.v >= 0 ? Number(cells[idx.v]) || 0 : 0,
    };
    if (!isValidCandle(candle)) return { ok: false, error: "row", row: n + 1 };
    byTime.set(candle.timestamp, candle);
  }
  return { ok: true, candles: [...byTime.values()].sort((a, b) => a.timestamp - b.timestamp) };
}

export function isValidCandle(c: Candle): boolean {
  return (
    Number.isFinite(c.timestamp) &&
    [c.open, c.high, c.low, c.close].every((v) => Number.isFinite(v) && v > 0) &&
    c.high >= Math.max(c.open, c.close, c.low) &&
    c.low <= Math.min(c.open, c.close, c.high)
  );
}
