"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Chart } from "klinecharts";
import { TIMEFRAMES, type Candle } from "@/lib/candles";
import { toFaDigits } from "@/lib/format";
import type { Drawing } from "@/lib/grading";
import { t } from "@/lib/i18n";
import { JALALI_MONTHS, toJalaliParts } from "@/lib/jalali";
import { Button } from "@/components/ui";

export interface ReferenceOverlay {
  kind: "level" | "line" | "pivot" | "boundary" | "band";
  /** level: price. band: [low, high]. line: two points. pivot: one point. boundary: candle index. */
  price?: number;
  band?: [number, number];
  points?: { index: number; price: number }[];
  index?: number;
  color: string;
  dashed?: boolean;
}

const COLORS = {
  up: "#15803d",
  down: "#b91c1c",
  grid: "#f1f3f5",
  axis: "#d1d5db",
  text: "#5b6472",
  student: "#1d4ed8",
};

function periodOf(timeframe: string) {
  const unit = timeframe.slice(-1);
  const span = Number(timeframe.slice(0, -1));
  const type = ({ m: "minute", h: "hour", d: "day", w: "week" } as const)[unit] ?? "hour";
  return { type, span };
}

function formatTick(ts: number, withDates: boolean, stepMs: number): string {
  if (!withDates) return "";
  const p = toJalaliParts(new Date(ts));
  const pad = (n: number) => String(n).padStart(2, "0");
  if (stepMs >= TIMEFRAMES["1d"]) return toFaDigits(`${p.jd}`) + " " + JALALI_MONTHS[p.jm - 1];
  return toFaDigits(`${pad(p.hour)}:${pad(p.minute)}`);
}

/** Shows every candle. In review, the answer and hidden candles must not start out of view. */
function fitAll(chart: Chart, el: HTMLElement, count: number) {
  if (!count) return;
  const Y_AXIS_WIDTH = 80;
  chart.setOffsetRightDistance(16);
  chart.setBarSpace(Math.max(1.5, (el.clientWidth - Y_AXIS_WIDTH - 16) / count));
  chart.scrollToRealTime();
}

export interface CandleChartProps {
  candles: Candle[];
  timeframe: string;
  precision: number;
  /** Show real dates on the axis. Off for anonymised questions. */
  showDates?: boolean;
  /** Tools shown in the toolbar. Empty hides the toolbar. */
  tools?: string[];
  /** Drawing with any of these tools replaces the previous one, so there is one graded answer. */
  singleTools?: string[];
  drawings?: Drawing[];
  onDrawingsChange?: (drawings: Drawing[]) => void;
  references?: ReferenceOverlay[];
  /** When set, the chart shows a read-only drawing in this color instead of accepting input. */
  height?: number;
  ariaLabel?: string;
}

export function CandleChart({
  candles,
  timeframe,
  precision,
  showDates = true,
  tools = [],
  singleTools = [],
  drawings,
  onDrawingsChange,
  references = [],
  height = 400,
  ariaLabel,
}: CandleChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<Chart | null>(null);
  const [ready, setReady] = useState(false);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  /** overlay id -> drawing, in drawing order. */
  const liveRef = useRef(new Map<string, Drawing>());
  const refIdsRef = useRef<string[]>([]);
  const onChangeRef = useRef(onDrawingsChange);
  const toolsKey = tools.join(",");
  const readOnly = tools.length === 0;

  useEffect(() => {
    onChangeRef.current = onDrawingsChange;
  }, [onDrawingsChange]);

  const emit = useCallback(() => {
    onChangeRef.current?.([...liveRef.current.values()]);
  }, []);

  const pointsOf = (overlay: { points: { dataIndex?: number; value?: number }[] }) =>
    overlay.points.flatMap((p) =>
      typeof p.dataIndex === "number" && typeof p.value === "number" ? [{ index: p.dataIndex, price: p.value }] : [],
    );

  const addOverlay = useCallback(
    (tool: string, points: { index: number; price: number }[] | null) => {
      const chart = chartRef.current;
      if (!chart) return;
      const common = {
        name: tool,
        lock: readOnly,
        styles: { line: { color: COLORS.student, size: 2 }, point: { color: COLORS.student, borderColor: COLORS.student, activeColor: COLORS.student, activeBorderColor: COLORS.student } },
        onDrawEnd: ({ overlay }: { overlay: { id: string; name: string; points: { dataIndex?: number; value?: number }[] } }) => {
          if (singleTools.includes(tool)) {
            for (const [id, d] of [...liveRef.current]) {
              if (singleTools.includes(d.tool)) {
                chartRef.current?.removeOverlay({ id });
                liveRef.current.delete(id);
              }
            }
          }
          liveRef.current.set(overlay.id, { tool: overlay.name, points: pointsOf(overlay) });
          setActiveTool(null);
          emit();
          return false;
        },
        onPressedMoveEnd: ({ overlay }: { overlay: { id: string; name: string; points: { dataIndex?: number; value?: number }[] } }) => {
          if (liveRef.current.has(overlay.id)) {
            liveRef.current.set(overlay.id, { tool: overlay.name, points: pointsOf(overlay) });
            emit();
          }
          return false;
        },
        onRemoved: ({ overlay }: { overlay: { id: string } }) => {
          if (liveRef.current.delete(overlay.id)) emit();
          return false;
        },
      };
      if (points) {
        const id = chart.createOverlay({
          ...common,
          points: points.map((p) => ({ dataIndex: p.index, value: p.price, timestamp: candles[p.index]?.timestamp })),
        } as never) as string | null;
        if (id) liveRef.current.set(id, { tool, points });
      } else {
        chart.createOverlay(common as never);
      }
    },
    [readOnly, singleTools, emit, candles],
  );

  // Create the chart once per data set. Canvas text cannot use CSS, so everything is set here.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let disposed = false;
    let dispose: ((c: HTMLElement) => void) | null = null;
    const live = liveRef.current;

    import("klinecharts").then((kc) => {
      if (disposed || !containerRef.current) return;
      dispose = kc.dispose;
      kc.registerLocale("fa", {
        time: `${t.chart.time}: `,
        open: `${t.chart.open}: `,
        high: `${t.chart.high}: `,
        low: `${t.chart.low}: `,
        close: `${t.chart.close}: `,
        volume: `${t.chart.volume}: `,
        change: `${t.chart.change}: `,
        turnover: "",
        second: "ثانیه",
        minute: "دقیقه",
        hour: "ساعت",
        day: "روز",
        week: "هفته",
        month: "ماه",
        year: "سال",
      });
      const stepMs = TIMEFRAMES[timeframe] ?? 3_600_000;
      const font = "Vazirmatn Variable, system-ui, sans-serif";
      const chart = kc.init(el, {
        locale: "fa",
        timezone: "Asia/Tehran",
        decimalFold: { format: (v: string | number) => toFaDigits(String(v)) },
        formatter: {
          formatDate: ({ timestamp }) => formatTick(timestamp, showDates, stepMs),
        },
        styles: {
          grid: { horizontal: { color: COLORS.grid }, vertical: { color: COLORS.grid } },
          candle: {
            bar: {
              upColor: COLORS.up,
              downColor: COLORS.down,
              noChangeColor: COLORS.text,
              upBorderColor: COLORS.up,
              downBorderColor: COLORS.down,
              noChangeBorderColor: COLORS.text,
              upWickColor: COLORS.up,
              downWickColor: COLORS.down,
              noChangeWickColor: COLORS.text,
            },
            tooltip: { showRule: "none" },
            priceMark: { high: { show: false }, low: { show: false }, last: { line: { show: false } } },
          },
          xAxis: {
            axisLine: { color: COLORS.axis },
            tickLine: { color: COLORS.axis },
            tickText: { color: COLORS.text, family: font, size: 11 },
          },
          yAxis: {
            axisLine: { color: COLORS.axis },
            tickLine: { color: COLORS.axis },
            tickText: { color: COLORS.text, family: font, size: 11 },
          },
          crosshair: {
            horizontal: { text: { family: font } },
            vertical: { text: { family: font } },
          },
        },
      });
      if (!chart) return;
      chartRef.current = chart;
      chart.setSymbol({ ticker: "chart", pricePrecision: precision, volumePrecision: 0 });
      chart.setPeriod(periodOf(timeframe));
      chart.setDataLoader({ getBars: ({ callback }) => callback(candles as never, false) });
      fitAll(chart, el, candles.length);
      setReady(true);
    });

    return () => {
      disposed = true;
      live.clear();
      refIdsRef.current = [];
      if (dispose) dispose(el);
      chartRef.current = null;
      setReady(false);
    };
  }, [candles, timeframe, precision, showDates]);

  // Reflect the chart's container size, for rotation and sidebar changes.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      const chart = chartRef.current;
      if (!chart) return;
      chart.resize();
      fitAll(chart, el, chart.getDataList().length);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Restore saved drawings when the chart is created (resume, or review).
  const initialDrawings = useRef(drawings);
  useEffect(() => {
    if (!ready) return;
    for (const d of initialDrawings.current ?? []) addOverlay(d.tool, d.points);
  }, [ready, addOverlay]);

  // Reference overlays: the correct answer, tolerance band, pivots and the reveal boundary.
  const referencesKey = useMemo(() => JSON.stringify(references), [references]);
  useEffect(() => {
    const chart = chartRef.current;
    if (!ready || !chart) return;
    for (const id of refIdsRef.current) chart.removeOverlay({ id });
    const list: ReferenceOverlay[] = JSON.parse(referencesKey);
    const ids: (string | null)[] = [];
    const last = candles.length - 1;
    const tsAt = (i: number) => candles[Math.max(0, Math.min(last, i))]?.timestamp;
    const lineStyle = (r: ReferenceOverlay) => ({
      line: { color: r.color, size: 2, style: r.dashed ? "dashed" : "solid", dashedValue: [4, 4] },
      point: { color: "transparent", borderColor: "transparent", activeColor: "transparent", activeBorderColor: "transparent" },
    });
    const base = { lock: true, needDefaultPointFigure: false, needDefaultYAxisFigure: false, needDefaultXAxisFigure: false };
    for (const r of list) {
      if (r.kind === "level" && r.price !== undefined) {
        ids.push(chart.createOverlay({ ...base, name: "horizontalStraightLine", points: [{ timestamp: tsAt(0), dataIndex: 0, value: r.price }], styles: lineStyle(r) } as never) as string | null);
      } else if (r.kind === "band" && r.band) {
        for (const value of r.band) {
          ids.push(chart.createOverlay({ ...base, name: "horizontalStraightLine", points: [{ timestamp: tsAt(0), dataIndex: 0, value }], styles: lineStyle({ ...r, dashed: true }) } as never) as string | null);
        }
      } else if (r.kind === "line" && r.points?.length === 2) {
        ids.push(chart.createOverlay({ ...base, name: "straightLine", points: r.points.map((p) => ({ timestamp: tsAt(p.index), dataIndex: p.index, value: p.price })), styles: lineStyle(r) } as never) as string | null);
      } else if (r.kind === "boundary" && r.index !== undefined) {
        ids.push(chart.createOverlay({ ...base, name: "verticalStraightLine", points: [{ timestamp: tsAt(r.index), dataIndex: r.index, value: candles[r.index]?.close }], styles: lineStyle({ ...r, dashed: true }) } as never) as string | null);
      } else if (r.kind === "pivot" && r.points?.[0]) {
        const p = r.points[0];
        ids.push(chart.createOverlay({
          ...base,
          name: "simpleAnnotation",
          extendData: "●",
          points: [{ timestamp: tsAt(p.index), dataIndex: p.index, value: p.price }],
          styles: { line: { color: "transparent" }, text: { color: r.color, backgroundColor: "transparent", borderColor: "transparent", size: 14 } },
        } as never) as string | null);
      }
    }
    refIdsRef.current = ids.filter((x): x is string => !!x);
  }, [ready, referencesKey, candles]);

  function pickTool(tool: string) {
    if (activeTool === tool) {
      setActiveTool(null);
      return;
    }
    setActiveTool(tool);
    addOverlay(tool, null);
  }

  function clearDrawings() {
    const chart = chartRef.current;
    if (!chart) return;
    for (const id of liveRef.current.keys()) chart.removeOverlay({ id });
    liveRef.current.clear();
    setActiveTool(null);
    emit();
  }

  function undo() {
    const chart = chartRef.current;
    const ids = [...liveRef.current.keys()];
    const id = ids.at(-1);
    if (!chart || !id) return;
    chart.removeOverlay({ id });
    liveRef.current.delete(id);
    emit();
  }

  return (
    <div>
      {!readOnly && (
        <div role="toolbar" aria-label={t.questions.fields.tools} className="mb-2 flex flex-wrap items-center gap-1.5">
          {toolsKey.split(",").map((tool) => (
            <button
              key={tool}
              type="button"
              aria-pressed={activeTool === tool}
              onClick={() => pickTool(tool)}
              className={`min-h-9 rounded-lg border px-3 text-xs font-medium ${
                activeTool === tool ? "border-accent bg-accent text-white" : "border-line bg-white hover:bg-surface"
              }`}
            >
              {t.tools[tool] ?? tool}
            </button>
          ))}
          <span className="mx-1 h-5 w-px bg-line" aria-hidden />
          <Button variant="ghost" className="min-h-9 px-2 text-xs" onClick={undo}>
            {t.tools.undo}
          </Button>
          <Button variant="ghost" className="min-h-9 px-2 text-xs" onClick={clearDrawings}>
            {t.tools.remove}
          </Button>
        </div>
      )}
      {/* The chart stays left-to-right inside the RTL page. touch-none lets drawing work on phones. */}
      <div
        ref={containerRef}
        dir="ltr"
        role="img"
        aria-label={ariaLabel}
        style={{ height }}
        className="w-full touch-none overflow-hidden rounded-lg border border-line bg-white"
      />
    </div>
  );
}
