"use client";

import { useEffect, useImperativeHandle, useRef } from "react";
import type { Chart } from "klinecharts";
import type { Candle, DrawingTool } from "@/types/question";

export interface StudentChartHandle {
  createOverlay: (tool: DrawingTool) => void;
  reveal: (revealCandles: Candle[]) => void;
}

interface StudentChartProps {
  symbol: string;
  candles: Candle[];
  ref?: React.Ref<StudentChartHandle>;
}

export default function StudentChart({ symbol, candles, ref }: StudentChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<Chart | null>(null);
  const disposeRef = useRef<(() => void) | null>(null);
  const dataRef = useRef<Candle[]>(candles);

  useEffect(() => {
    if (!containerRef.current) return;
    let disposed = false;

    import("klinecharts").then(({ init, dispose }) => {
      if (disposed || !containerRef.current) return;

      const chart = init(containerRef.current, {
        styles: {
          grid: {
            horizontal: { color: "#1f2937" },
            vertical: { color: "#1f2937" },
          },
          candle: {
            bar: {
              upColor: "#22c55e",
              downColor: "#ef4444",
              noChangeColor: "#9ca3af",
              upBorderColor: "#22c55e",
              downBorderColor: "#ef4444",
              noChangeBorderColor: "#9ca3af",
              upWickColor: "#22c55e",
              downWickColor: "#ef4444",
              noChangeWickColor: "#9ca3af",
            },
          },
          xAxis: { axisLine: { color: "#374151" }, tickText: { color: "#9ca3af" } },
          yAxis: { axisLine: { color: "#374151" }, tickText: { color: "#9ca3af" } },
          crosshair: {
            horizontal: { line: { color: "#4b5563" } },
            vertical: { line: { color: "#4b5563" } },
          },
        },
      });
      chartRef.current = chart;

      if (chart) {
        chart.setSymbol({ ticker: symbol, pricePrecision: 2, volumePrecision: 0 });
        chart.setPeriod({ type: "hour", span: 1 });
        chart.setDataLoader({
          getBars: ({ callback }) => callback(dataRef.current),
        });
      }

      disposeRef.current = () => {
        if (containerRef.current) dispose(containerRef.current);
      };
    });

    return () => {
      disposed = true;
      disposeRef.current?.();
      disposeRef.current = null;
      chartRef.current = null;
    };
  }, [symbol]);

  useImperativeHandle(ref, () => ({
    createOverlay(tool) {
      chartRef.current?.createOverlay(tool);
    },
    reveal(revealCandles) {
      dataRef.current = [...dataRef.current, ...revealCandles];
      chartRef.current?.resetData();
    },
  }));

  return <div ref={containerRef} className="h-[420px] w-full" />;
}
