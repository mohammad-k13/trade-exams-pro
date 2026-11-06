"use client";

import { useMemo, useState, useTransition } from "react";
import { loadBinanceAction, parseCsvAction, saveQuestionAction } from "@/app/actions/master";
import { CandleChart, type ReferenceOverlay } from "@/components/chart/candle-chart";
import { Alert, Button, Card, Checkbox, Field, Input, Select, Textarea } from "@/components/ui";
import { FileInput } from "@/components/ui/client";
import { JalaliPicker } from "@/components/ui/jalali-picker";
import { TIMEFRAMES, pricePrecision, suggestTolerancePct, type Candle } from "@/lib/candles";
import { formatNumber, toFaDigits, toLatinDigits } from "@/lib/format";
import { directionOutcome, pivotsOnLine, type DrawPoint, type Drawing } from "@/lib/grading";
import { t } from "@/lib/i18n";
import { TOOL_NAMES } from "@/lib/schemas";

const q = t.questions;
type QType = keyof typeof q.types;

export interface EditorInitial {
  id: string;
  type: QType;
  title: string;
  prompt: string;
  explanation: string;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  topics: string[];
  symbol: string;
  timeframe: string;
  anonymize: boolean;
  candles: Candle[];
  visibleCount: number;
  allowedTools: string[];
  options: { id: string; text: string }[];
  correctOptionId: string | null;
  horizon: number;
  sidewaysPct: number;
  level: number | null;
  line: [DrawPoint, DrawPoint] | null;
  tolerancePct: number;
  minTouches: number;
}

const ANSWER_COLOR = "#15803d";
const BAND_COLOR = "#86efac";
const BOUNDARY_COLOR = "#a16207";

const parseNum = (s: string) => Number(toLatinDigits(s).replace(/[٫,]/g, "."));

export function QuestionEditor({ initial, now, topicSuggestions }: { initial?: EditorInitial; now: number; topicSuggestions: string[] }) {
  const [type, setType] = useState<QType>(initial?.type ?? "DIRECTION");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [prompt, setPrompt] = useState(initial?.prompt ?? "");
  const [explanation, setExplanation] = useState(initial?.explanation ?? "");
  const [difficulty, setDifficulty] = useState(initial?.difficulty ?? "MEDIUM");
  const [topicsText, setTopicsText] = useState(initial?.topics.join("، ") ?? "");
  const [anonymize, setAnonymize] = useState(initial?.anonymize ?? true);
  const [allowedTools, setAllowedTools] = useState<string[]>(initial?.allowedTools ?? ["horizontalStraightLine", "straightLine"]);

  const [source, setSource] = useState<"binance" | "csv">("binance");
  const [symbol, setSymbol] = useState(initial?.symbol ?? "BTCUSDT");
  const [timeframe, setTimeframe] = useState(initial?.timeframe ?? "1h");
  const [from, setFrom] = useState(() => new Date(now - 200 * 3_600_000));
  const [to, setTo] = useState(() => new Date(now));
  const [candles, setCandles] = useState<Candle[]>(initial?.candles ?? []);
  const [visibleCount, setVisibleCount] = useState(initial?.visibleCount ?? 0);

  const [options, setOptions] = useState(initial?.options.length ? initial.options : [{ id: "a", text: "" }, { id: "b", text: "" }]);
  const [correctOptionId, setCorrectOptionId] = useState<string | null>(initial?.correctOptionId ?? null);
  const [horizon, setHorizon] = useState(initial?.horizon ?? 10);
  const [sidewaysPct, setSidewaysPct] = useState(initial?.sidewaysPct ?? 0.5);
  const [level, setLevel] = useState<number | null>(initial?.level ?? null);
  const [line, setLine] = useState<[DrawPoint, DrawPoint] | null>(initial?.line ?? null);
  const [tolerancePct, setTolerancePct] = useState(initial?.tolerancePct ?? 0.5);
  const [minTouches, setMinTouches] = useState(initial?.minTouches ?? 2);

  const [dataPending, startData] = useTransition();
  const [savePending, startSave] = useTransition();
  const [dataError, setDataError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const visible = useMemo(() => candles.slice(0, visibleCount), [candles, visibleCount]);
  const future = useMemo(() => candles.slice(visibleCount), [candles, visibleCount]);
  const precision = useMemo(() => pricePrecision(candles), [candles]);
  const suggested = useMemo(() => (visible.length ? suggestTolerancePct(visible) : null), [visible]);

  function applyCandles(next: Candle[]) {
    setCandles(next);
    setVisibleCount(Math.max(20, Math.floor(next.length * 0.8)));
    setLevel(null);
    setLine(null);
    if (next.length) setTolerancePct(suggestTolerancePct(next.slice(0, Math.floor(next.length * 0.8))));
  }

  function fetchBinance() {
    setDataError(null);
    startData(async () => {
      const r = await loadBinanceAction({ symbol, timeframe, from: from.getTime(), to: to.getTime() });
      if (r.error !== undefined) setDataError(r.error);
      else applyCandles(r.data);
    });
  }

  function uploadCsv(file: File | undefined) {
    if (!file) return;
    setDataError(null);
    startData(async () => {
      const r = await parseCsvAction(await file.text());
      if (r.error !== undefined) setDataError(r.error);
      else applyCandles(r.data);
    });
  }

  const outcome = useMemo(() => {
    if (type !== "DIRECTION" || !visible.length || !future.length) return null;
    return directionOutcome(visible, future, horizon, sidewaysPct);
  }, [type, visible, future, horizon, sidewaysPct]);

  const pivots = useMemo(() => (type === "DRAW_TRENDLINE" && line ? pivotsOnLine(visible, line, tolerancePct) : []), [type, line, visible, tolerancePct]);

  const answerRefs = useMemo<ReferenceOverlay[]>(() => {
    if (type === "DRAW_LEVEL" && level) {
      const d = (level * tolerancePct) / 100;
      return [{ kind: "band", band: [level - d, level + d], color: BAND_COLOR }];
    }
    if (type === "DRAW_TRENDLINE") {
      return pivots.map((p) => ({ kind: "pivot" as const, points: [{ index: p.index, price: p.price }], color: ANSWER_COLOR }));
    }
    return [];
  }, [type, level, tolerancePct, pivots]);

  const windowRefs = useMemo<ReferenceOverlay[]>(
    () => (visibleCount > 0 && visibleCount < candles.length ? [{ kind: "boundary", index: visibleCount - 1, color: BOUNDARY_COLOR }] : []),
    [visibleCount, candles.length],
  );

  function onAnswerDrawings(drawings: Drawing[]) {
    const last = drawings.at(-1);
    if (type === "DRAW_LEVEL") setLevel(last?.points[0]?.price ?? null);
    if (type === "DRAW_TRENDLINE") setLine(last && last.points.length >= 2 ? [last.points[0], last.points[1]] : null);
  }

  function save() {
    setError(null);
    const input = {
      type,
      title,
      prompt,
      explanation,
      difficulty,
      topics: topicsText.split(/[,،]/).map((x) => x.trim()).filter(Boolean),
      symbol,
      timeframe,
      anonymize,
      candles,
      visibleCount,
      allowedTools,
      options: type === "MULTIPLE_CHOICE" ? options : [],
      correctOptionId,
      horizon,
      sidewaysPct,
      level,
      line,
      tolerancePct,
      minTouches,
    };
    startSave(async () => {
      const r = await saveQuestionAction(initial?.id ?? null, input);
      if (r?.error) setError(r.error);
    });
  }

  const answerChartKey = `${type}:${visibleCount}:${candles.length}`;
  const initialDrawing: Drawing[] | undefined =
    initial && initial.visibleCount === visibleCount
      ? type === "DRAW_LEVEL" && initial.level
        ? [{ tool: "horizontalStraightLine", points: [{ index: 0, price: initial.level }] }]
        : type === "DRAW_TRENDLINE" && initial.line
          ? [{ tool: "straightLine", points: initial.line }]
          : undefined
      : undefined;

  return (
    <div className="max-w-4xl space-y-5">
      <Card title={q.fields.type}>
        <div className="grid gap-2 sm:grid-cols-2">
          {(Object.keys(q.types) as QType[]).map((key) => (
            <label key={key} className={`cursor-pointer rounded-lg border p-3 text-sm ${type === key ? "border-accent bg-accent-soft" : "border-line"}`}>
              <input
                type="radio"
                name="qtype"
                value={key}
                checked={type === key}
                onChange={() => setType(key)}
                className="me-2 accent-accent"
              />
              <span className="font-medium">{q.types[key]}</span>
              <span className="mt-1 block text-xs leading-5 text-muted">{q.typeHints[key]}</span>
            </label>
          ))}
        </div>
      </Card>

      <Card title={q.step.data}>
        <div className="mb-4 flex gap-1 rounded-lg bg-surface p-1 text-sm">
          {(["binance", "csv"] as const).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={source === s}
              onClick={() => setSource(s)}
              className={`flex-1 rounded-md py-1.5 ${source === s ? "bg-white font-medium shadow-sm" : "text-muted"}`}
            >
              {q.source[s]}
            </button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={q.symbol} htmlFor="symbol">
            <Input id="symbol" dir="ltr" className="text-start" value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} />
          </Field>
          <Field label={q.timeframe} htmlFor="timeframe">
            <Select id="timeframe" dir="ltr" value={timeframe} onChange={(e) => setTimeframe(e.target.value)}>
              {Object.keys(TIMEFRAMES).map((k) => <option key={k} value={k}>{k}</option>)}
            </Select>
          </Field>
          {source === "binance" ? (
            <>
              <Field label={q.from} htmlFor="from"><JalaliPicker id="from" value={from} onChange={setFrom} /></Field>
              <Field label={q.to} htmlFor="to"><JalaliPicker id="to" value={to} onChange={setTo} /></Field>
              <div className="sm:col-span-2">
                <Button variant="secondary" disabled={dataPending} onClick={fetchBinance}>{dataPending ? q.fetching : q.fetch}</Button>
              </div>
            </>
          ) : (
            <div className="sm:col-span-2">
              <Field label={q.csvFile} htmlFor="candles-csv" hint={q.csvHint}>
                <FileInput id="candles-csv" accept=".csv,text/csv" onFile={uploadCsv} />
              </Field>
            </div>
          )}
        </div>
        {dataError && <div className="mt-3"><Alert>{dataError}</Alert></div>}
        {candles.length > 0 && !dataError && <p className="mt-3 text-sm text-good">{toFaDigits(q.candlesLoaded(candles.length))}</p>}
      </Card>

      {candles.length > 0 && (
        <Card title={q.step.window}>
          <CandleChart candles={candles} timeframe={timeframe} precision={precision} references={windowRefs} height={300} ariaLabel={q.step.window} />
          <div className="mt-4">
            <label htmlFor="split" className="text-sm font-medium">{q.split}</label>
            <input
              id="split"
              type="range"
              dir="ltr"
              min={20}
              max={Math.max(20, candles.length - 1)}
              value={visibleCount}
              onChange={(e) => setVisibleCount(Number(e.target.value))}
              className="mt-2 block w-full accent-accent"
            />
            <p className="mt-2 flex justify-between text-sm text-muted">
              <span>{toFaDigits(q.visibleCount(visibleCount))}</span>
              <span>{toFaDigits(q.hiddenCount(candles.length - visibleCount))}</span>
            </p>
            <p className="mt-1 text-xs leading-5 text-muted">{q.splitHint}</p>
          </div>
        </Card>
      )}

      {candles.length > 0 && (
        <Card title={q.step.answer}>
          {type === "MULTIPLE_CHOICE" && (
            <fieldset className="space-y-2">
              <legend className="mb-2 text-sm font-medium">{q.options}</legend>
              {options.map((o, i) => (
                <div key={o.id} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="correct"
                    aria-label={q.correctOption}
                    checked={correctOptionId === o.id}
                    onChange={() => setCorrectOptionId(o.id)}
                    className="size-4 shrink-0 accent-accent"
                  />
                  <Input
                    aria-label={q.optionPlaceholder(i + 1)}
                    placeholder={toFaDigits(q.optionPlaceholder(i + 1))}
                    value={o.text}
                    onChange={(e) => setOptions(options.map((x) => (x.id === o.id ? { ...x, text: e.target.value } : x)))}
                  />
                  {options.length > 2 && (
                    <Button variant="ghost" className="px-2" aria-label={q.removeOption} onClick={() => setOptions(options.filter((x) => x.id !== o.id))}>×</Button>
                  )}
                </div>
              ))}
              <p className="text-xs text-muted">{q.optionsRule} {q.correctOption}: دکمه‌ی کنار گزینه.</p>
              {options.length < 8 && (
                <Button
                  variant="secondary"
                  className="min-h-9"
                  onClick={() => {
                    const used = new Set(options.map((o) => o.id));
                    const id = "abcdefghijkl".split("").find((c) => !used.has(c))!;
                    setOptions([...options, { id, text: "" }]);
                  }}
                >
                  {q.addOption}
                </Button>
              )}
            </fieldset>
          )}

          {type === "DIRECTION" && (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={q.horizon} htmlFor="horizon">
                  <Input id="horizon" type="number" min={1} max={Math.max(1, future.length)} value={horizon} onChange={(e) => setHorizon(Number(e.target.value))} dir="ltr" />
                </Field>
                <Field label={q.sideways} htmlFor="sideways">
                  <Input id="sideways" type="number" step="0.1" min={0} value={sidewaysPct} onChange={(e) => setSidewaysPct(Number(e.target.value))} dir="ltr" />
                </Field>
              </div>
              {outcome && (
                <Alert tone="accent">
                  {q.computedAnswer}: <strong>{t.direction[outcome.direction]}</strong>
                  <span className="ms-2">{q.changeNote(formatNumber(outcome.changePct), toFaDigits(Math.min(horizon, future.length)))}</span>
                </Alert>
              )}
            </div>
          )}

          {(type === "DRAW_LEVEL" || type === "DRAW_TRENDLINE") && (
            <div className="space-y-3">
              <p className="text-sm text-muted">{type === "DRAW_LEVEL" ? q.drawCorrectLevel : q.drawCorrectLine}</p>
              <CandleChart
                key={answerChartKey}
                candles={visible}
                timeframe={timeframe}
                precision={precision}
                tools={[type === "DRAW_LEVEL" ? "horizontalStraightLine" : "straightLine"]}
                singleTools={[type === "DRAW_LEVEL" ? "horizontalStraightLine" : "straightLine"]}
                drawings={initialDrawing}
                onDrawingsChange={onAnswerDrawings}
                references={answerRefs}
                height={340}
                ariaLabel={q.step.answer}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                {type === "DRAW_LEVEL" && (
                  <Field label={q.levelPrice} htmlFor="level">
                    <Input id="level" dir="ltr" inputMode="decimal" value={level ?? ""} onChange={(e) => setLevel(parseNum(e.target.value) || null)} />
                  </Field>
                )}
                <Field label={q.tolerance} htmlFor="tol" hint={suggested ? q.toleranceSuggested(formatNumber(suggested, 3)) : undefined}>
                  <div className="flex gap-2">
                    <Input id="tol" dir="ltr" type="number" step="0.01" min={0.001} value={tolerancePct} onChange={(e) => setTolerancePct(Number(e.target.value))} />
                    {suggested && <Button variant="secondary" onClick={() => setTolerancePct(suggested)}>{q.useSuggested}</Button>}
                  </div>
                </Field>
                {type === "DRAW_TRENDLINE" && (
                  <Field label={q.minTouches} htmlFor="touches">
                    <Input id="touches" dir="ltr" type="number" min={2} max={10} value={minTouches} onChange={(e) => setMinTouches(Number(e.target.value))} />
                  </Field>
                )}
              </div>
              {type === "DRAW_TRENDLINE" && line && (
                pivots.length >= minTouches ? (
                  <Alert tone="good">{toFaDigits(q.pivotsFound(pivots.length))}</Alert>
                ) : (
                  <Alert tone="warn">{q.pivotsTooFew}</Alert>
                )
              )}
            </div>
          )}
        </Card>
      )}

      <Card title={q.step.info}>
        <div className="space-y-4">
          <Field label={q.fields.title} htmlFor="title" hint={q.fields.titleHint}>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label={q.fields.prompt} htmlFor="prompt">
            <Textarea id="prompt" rows={2} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
          </Field>
          <Field label={q.fields.explanation} htmlFor="explanation">
            <Textarea id="explanation" rows={3} value={explanation} onChange={(e) => setExplanation(e.target.value)} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={q.fields.difficulty} htmlFor="difficulty">
              <Select id="difficulty" value={difficulty} onChange={(e) => setDifficulty(e.target.value as typeof difficulty)}>
                {Object.entries(q.difficulty).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </Field>
            <Field label={q.fields.topics} htmlFor="topics" hint={q.fields.topicsHint}>
              <Input id="topics" list="topic-list" value={topicsText} onChange={(e) => setTopicsText(e.target.value)} />
              <datalist id="topic-list">
                {topicSuggestions.map((x) => <option key={x} value={x} />)}
              </datalist>
            </Field>
          </div>
          <fieldset>
            <legend className="mb-2 text-sm font-medium">{q.fields.tools}</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {TOOL_NAMES.map((tool) => (
                <Checkbox
                  key={tool}
                  label={t.tools[tool]}
                  checked={allowedTools.includes(tool)}
                  onChange={(e) => setAllowedTools(e.target.checked ? [...allowedTools, tool] : allowedTools.filter((x) => x !== tool))}
                />
              ))}
            </div>
          </fieldset>
          <Checkbox label={q.fields.anonymize} hint={q.fields.anonymizeHint} checked={anonymize} onChange={(e) => setAnonymize(e.target.checked)} />
        </div>
      </Card>

      {error && <Alert>{error}</Alert>}
      <div className="flex gap-2">
        <Button disabled={savePending || candles.length === 0} onClick={save}>{savePending ? t.common.saving : t.common.save}</Button>
      </div>
    </div>
  );
}
