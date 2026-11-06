"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { CandleChart } from "@/components/chart/candle-chart";
import { Alert, Badge, Button, Card } from "@/components/ui";
import { formatCountdown, formatNumber, toFaDigits } from "@/lib/format";
import { LEVEL_TOOLS, LINE_TOOLS, type Direction, type Drawing } from "@/lib/grading";
import { t } from "@/lib/i18n";
import type { AttemptView } from "@/server/attempts";
import type { StudentQuestion } from "@/server/dto";

const a = t.attempt;

type LocalAnswer = { choice: string | null; drawings: Drawing[]; flagged: boolean };
type SaveStatus = "idle" | "saving" | "saved" | "failed";

function fromServer(response: unknown, flagged: boolean): LocalAnswer {
  const r = response as { kind?: string; optionId?: string; direction?: string; drawings?: Drawing[] } | null;
  return { choice: r?.optionId ?? r?.direction ?? null, drawings: r?.drawings ?? [], flagged };
}

function toResponse(q: StudentQuestion, answer: LocalAnswer) {
  const { drawings, choice } = answer;
  if (q.type === "MULTIPLE_CHOICE" && choice) return { kind: "option", optionId: choice, drawings };
  if (q.type === "DIRECTION" && choice) return { kind: "direction", direction: choice, drawings };
  if (q.type.startsWith("DRAW") && drawings.length) return { kind: "draw", drawings };
  return { kind: "none", drawings };
}

function isAnswered(q: StudentQuestion, x: LocalAnswer | undefined) {
  if (!x) return false;
  if (q.type === "DRAW_LEVEL") return x.drawings.some((d) => LEVEL_TOOLS.includes(d.tool));
  if (q.type === "DRAW_TRENDLINE") return x.drawings.some((d) => LINE_TOOLS.includes(d.tool));
  return !!x.choice;
}

const EMPTY_ANSWER: LocalAnswer = { choice: null, drawings: [], flagged: false };
const DIRECTIONS: Direction[] = ["up", "down", "sideways"];

export function AttemptRunner({ view }: { view: AttemptView }) {
  const router = useRouter();
  const { questions, attemptId } = view;
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, LocalAnswer>>(() =>
    Object.fromEntries(Object.entries(view.answers).map(([id, x]) => [id, fromServer(x.response, x.flagged)])),
  );
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [submitting, startSubmit] = useTransition();
  const [confirming, setConfirming] = useState(false);

  // The countdown is the server's deadline, corrected for this device's clock. It only displays;
  // the server rejects anything that arrives too late.
  const deadline = useMemo(() => new Date(view.deadlineAt).getTime(), [view.deadlineAt]);
  const offsetRef = useRef(0);
  const [remaining, setRemaining] = useState<number | null>(null);

  const dirtyRef = useRef(new Set<string>());
  const answersRef = useRef(answers);
  const lastTickRef = useRef(0);
  const timeRef = useRef<Record<string, number>>({});
  const finishingRef = useRef(false);
  const current = questions[index];
  const currentIdRef = useRef(current?.examQuestionId);

  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  useEffect(() => {
    offsetRef.current = new Date(view.serverNow).getTime() - Date.now();
    lastTickRef.current = Date.now();
  }, [view.serverNow]);

  const account = useCallback(() => {
    const id = currentIdRef.current;
    const now = Date.now();
    if (id) timeRef.current[id] = (timeRef.current[id] ?? 0) + (now - lastTickRef.current);
    lastTickRef.current = now;
  }, []);

  const flush = useCallback(async (): Promise<boolean> => {
    account();
    const ids = new Set([...dirtyRef.current, ...Object.keys(timeRef.current).filter((id) => timeRef.current[id] > 0)]);
    if (!ids.size) return true;
    setStatus("saving");
    let ok = true;
    for (const id of ids) {
      const q = questions.find((x) => x.examQuestionId === id);
      if (!q) continue;
      const delta = Math.min(timeRef.current[id] ?? 0, 3_600_000);
      const answer = answersRef.current[id];
      const dirty = dirtyRef.current.has(id);
      const body = {
        examQuestionId: id,
        timeDeltaMs: Math.round(delta),
        ...(dirty && answer ? { response: toResponse(q, answer), flagged: answer.flagged } : {}),
      };
      try {
        const res = await fetch(`/api/attempts/${attemptId}/answers`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          keepalive: true,
        });
        if (res.status === 409) {
          finishingRef.current = true;
          router.replace(`/student/attempts/${attemptId}/result`);
          return false;
        }
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { serverNow: string };
        offsetRef.current = new Date(data.serverNow).getTime() - Date.now();
        dirtyRef.current.delete(id);
        timeRef.current[id] = 0;
      } catch {
        ok = false;
      }
    }
    setStatus(ok ? "saved" : "failed");
    return ok;
  }, [account, attemptId, questions, router]);

  const submit = useCallback(async () => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    await flush();
    await fetch(`/api/attempts/${attemptId}/submit`, { method: "POST", keepalive: true }).catch(() => undefined);
    router.replace(`/student/attempts/${attemptId}/result`);
    router.refresh();
  }, [attemptId, flush, router]);

  // Tick the clock and auto-submit at zero.
  useEffect(() => {
    const tick = () => {
      const left = deadline - (Date.now() + offsetRef.current);
      setRemaining(left);
      if (left <= 0) void submit();
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [deadline, submit]);

  // Debounced autosave, plus a retry loop for when the connection drops.
  useEffect(() => {
    const id = setInterval(() => {
      if (dirtyRef.current.size) void flush();
    }, 2500);
    const heartbeat = setInterval(() => void flush(), 30_000);
    const onLeave = () => void flush();
    const onOnline = () => void flush();
    window.addEventListener("pagehide", onLeave);
    window.addEventListener("online", onOnline);
    return () => {
      clearInterval(id);
      clearInterval(heartbeat);
      window.removeEventListener("pagehide", onLeave);
      window.removeEventListener("online", onOnline);
    };
  }, [flush]);

  function update(id: string, patch: Partial<LocalAnswer>) {
    setAnswers((prev) => {
      const next = { ...prev, [id]: { ...EMPTY_ANSWER, ...prev[id], ...patch } };
      answersRef.current = next;
      return next;
    });
    dirtyRef.current.add(id);
    setStatus("saving");
  }

  function go(next: number) {
    account();
    currentIdRef.current = questions[next].examQuestionId;
    setIndex(next);
    void flush();
  }

  const unanswered = questions.filter((q) => !isAnswered(q, answers[q.examQuestionId])).length;
  const answer = answers[current.examQuestionId];
  const lowTime = remaining !== null && remaining < 60_000;

  const singleTools = current.type === "DRAW_LEVEL" ? LEVEL_TOOLS : current.type === "DRAW_TRENDLINE" ? LINE_TOOLS : [];
  const rule = current.rule;
  const ruleText =
    current.type === "DIRECTION"
      ? t.questions.gradeRule.direction(toFaDigits(rule.horizon ?? 0), formatNumber(rule.sidewaysPct ?? 0))
      : current.type === "DRAW_LEVEL"
        ? t.questions.gradeRule.level(formatNumber(rule.tolerancePct ?? 0, 3))
        : current.type === "DRAW_TRENDLINE"
          ? t.questions.gradeRule.trendline(toFaDigits(rule.minTouches ?? 0), formatNumber(rule.tolerancePct ?? 0, 3))
          : null;

  return (
    <div className="mx-auto max-w-4xl">
      <div className="sticky top-0 z-10 -mx-4 mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-line bg-white px-4 py-2.5 sm:-mx-6 sm:px-6">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{view.examTitle}</p>
          <p className="text-xs text-muted" aria-live="polite">
            {status === "saving" ? a.saving : status === "saved" ? a.autosaved : status === "failed" ? a.saveFailed : ""}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <p role="timer" aria-label={a.timeLeft} dir="ltr" className={`text-lg font-bold tabular-nums ${lowTime ? "text-bad" : ""}`}>
            {remaining === null ? "" : formatCountdown(remaining)}
          </p>
          <Button onClick={() => setConfirming(true)} disabled={submitting}>{a.submit}</Button>
        </div>
      </div>

      {status === "failed" && <div className="mb-3"><Alert>{a.saveFailed}</Alert></div>}

      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-sm font-medium text-muted">{a.question(toFaDigits(index + 1), toFaDigits(questions.length))}</h1>
          <div className="flex items-center gap-2">
            <Badge>{toFaDigits(current.points)} {t.common.points}</Badge>
            <Button
              variant={answer?.flagged ? "secondary" : "ghost"}
              aria-pressed={!!answer?.flagged}
              className="min-h-8 px-2.5 text-xs"
              onClick={() => update(current.examQuestionId, { flagged: !answer?.flagged })}
            >
              {answer?.flagged ? `⚑ ${a.flagged}` : `⚐ ${a.flag}`}
            </Button>
          </div>
        </div>
        <p className="mb-3 leading-7 whitespace-pre-line">{current.prompt}</p>
        <p className="mb-3 text-xs text-muted" dir="auto">
          {current.symbol ? <span dir="ltr">{current.symbol} · </span> : <span>{t.chart.hiddenSymbol} · </span>}
          <span dir="ltr">{current.timeframe}</span>
        </p>

        <CandleChart
          key={current.examQuestionId}
          candles={current.candles}
          timeframe={current.timeframe}
          precision={current.precision}
          showDates={!current.anonymized}
          tools={current.allowedTools}
          singleTools={singleTools}
          drawings={answer?.drawings}
          onDrawingsChange={(drawings) => update(current.examQuestionId, { drawings })}
          height={380}
          ariaLabel={current.prompt}
        />

        <div className="mt-4">
          {current.type === "MULTIPLE_CHOICE" && (
            <fieldset className="space-y-2">
              <legend className="mb-2 text-sm font-medium">{a.chooseOne}</legend>
              {current.options?.map((o) => (
                <label key={o.id} className={`flex cursor-pointer items-center gap-2.5 rounded-lg border p-3 text-sm ${answer?.choice === o.id ? "border-accent bg-accent-soft" : "border-line hover:bg-surface"}`}>
                  <input
                    type="radio"
                    name={`q-${current.examQuestionId}`}
                    checked={answer?.choice === o.id}
                    onChange={() => update(current.examQuestionId, { choice: o.id })}
                    className="accent-accent"
                  />
                  {o.text}
                </label>
              ))}
            </fieldset>
          )}
          {current.type === "DIRECTION" && (
            <fieldset>
              <legend className="mb-2 text-sm font-medium">{a.predict}</legend>
              <div className="grid grid-cols-3 gap-2">
                {DIRECTIONS.map((d) => (
                  <label key={d} className={`cursor-pointer rounded-lg border p-3 text-center text-sm font-medium ${answer?.choice === d ? "border-accent bg-accent-soft text-accent" : "border-line hover:bg-surface"}`}>
                    <input
                      type="radio"
                      className="sr-only"
                      name={`q-${current.examQuestionId}`}
                      checked={answer?.choice === d}
                      onChange={() => update(current.examQuestionId, { choice: d })}
                    />
                    {t.direction[d]}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          {current.type === "DRAW_LEVEL" && <Alert tone="accent">{a.drawLevelHint}</Alert>}
          {current.type === "DRAW_TRENDLINE" && <Alert tone="accent">{a.drawLineHint}</Alert>}
          {ruleText && (
            <p className="mt-3 text-xs leading-5 text-muted">
              {a.gradingRule}: {ruleText}
            </p>
          )}
        </div>

        <div className="mt-5 flex justify-between gap-2">
          <Button variant="secondary" disabled={index === 0} onClick={() => go(index - 1)}>{t.common.previous}</Button>
          <Button variant="secondary" disabled={index === questions.length - 1} onClick={() => go(index + 1)}>{t.common.next}</Button>
        </div>
      </Card>

      <Card title={a.overview} className="mt-4">
        <nav aria-label={a.overview} className="flex flex-wrap gap-1.5">
          {questions.map((q, i) => {
            const done = isAnswered(q, answers[q.examQuestionId]);
            const flagged = answers[q.examQuestionId]?.flagged;
            return (
              <button
                key={q.examQuestionId}
                type="button"
                aria-current={i === index ? "step" : undefined}
                aria-label={`${a.question(toFaDigits(i + 1), toFaDigits(questions.length))}، ${done ? a.answered : a.unanswered}${flagged ? `، ${a.flagged}` : ""}`}
                onClick={() => go(i)}
                className={`relative size-10 rounded-lg border text-sm ${i === index ? "border-accent font-bold" : "border-line"} ${done ? "bg-accent-soft" : "bg-white"}`}
              >
                {toFaDigits(i + 1)}
                {flagged && <span aria-hidden className="absolute -top-1 -end-1 text-xs text-warn">⚑</span>}
              </button>
            );
          })}
        </nav>
      </Card>

      {confirming && (
        <div role="alertdialog" aria-modal="true" aria-labelledby="submit-title" className="fixed inset-0 z-30 flex items-center justify-center bg-ink/40 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-5">
            <h2 id="submit-title" className="font-semibold">{a.submit}</h2>
            <p className="mt-2 text-sm leading-6 text-muted">{a.submitConfirm(toFaDigits(unanswered))}</p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" autoFocus onClick={() => setConfirming(false)}>{t.common.cancel}</Button>
              <Button disabled={submitting} onClick={() => startSubmit(submit)}>{submitting ? t.common.saving : a.submit}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
