import { z } from "zod";
import { TIMEFRAMES } from "./candles";
import { toLatinDigits } from "./format";
import { t } from "./i18n";

const v = t.validation;

export const text = (max = 200) =>
  z.string().trim().min(1, v.required).max(max, v.tooLong);

export const optionalText = (max = 2000) => z.string().trim().max(max, v.tooLong).default("");

export const username = z.preprocess(
  (x) => (typeof x === "string" ? toLatinDigits(x).trim().toLowerCase() : x),
  z.string().regex(/^[a-z0-9._]{3,40}$/, v.username),
);

/** Iranian mobile in the canonical 09xxxxxxxxx form. Empty becomes null. */
export const phone = z.preprocess(
  (x) => {
    if (typeof x !== "string") return x;
    const s = toLatinDigits(x).replace(/[\s-]/g, "");
    if (!s) return null;
    return s.replace(/^(\+98|0098|98)/, "0");
  },
  z.string().regex(/^09\d{9}$/, v.phone).nullable(),
);

export const password = z.string().min(8, t.auth.passwordTooShort).max(200, v.tooLong);

export const studentInput = z.object({
  fullName: text(100),
  username,
  phone: phone.optional().default(null),
  groupIds: z.array(z.string()).max(100).default([]),
});

export const demoRequestInput = z.object({
  name: text(100),
  institute: text(150),
  phone: phone.refine((p) => p !== null, v.phone),
  message: optionalText(1000),
});

export const candleSchema = z.object({
  timestamp: z.number().finite(),
  open: z.number().positive().finite(),
  high: z.number().positive().finite(),
  low: z.number().positive().finite(),
  close: z.number().positive().finite(),
  volume: z.number().nonnegative().finite().default(0),
});

export const TOOL_NAMES = [
  "horizontalStraightLine",
  "straightLine",
  "rayLine",
  "segment",
  "fibonacciLine",
  "parallelStraightLine",
  "priceChannelLine",
] as const;

export const MAX_CANDLES = 1000;

const drawPoint = z.object({ index: z.number().int().min(-5000).max(10000), price: z.number().positive().finite() });

const q = t.questions;

export const questionInput = z
  .object({
    type: z.enum(["MULTIPLE_CHOICE", "DIRECTION", "DRAW_LEVEL", "DRAW_TRENDLINE"]),
    title: text(150),
    prompt: text(1000),
    explanation: text(3000),
    difficulty: z.enum(["EASY", "MEDIUM", "HARD"]),
    topics: z.array(z.string().trim().min(1).max(60)).max(10),
    symbol: text(30),
    timeframe: z.string().refine((x) => x in TIMEFRAMES),
    anonymize: z.boolean(),
    candles: z.array(candleSchema).max(MAX_CANDLES, q.tooManyCandles),
    visibleCount: z.number().int().min(20, q.tooFewCandles),
    allowedTools: z.array(z.enum(TOOL_NAMES)).max(TOOL_NAMES.length),
    options: z.array(z.object({ id: z.string().max(20), text: z.string().trim().min(1, v.required).max(300, v.tooLong) })).max(8).default([]),
    correctOptionId: z.string().max(20).nullable().default(null),
    horizon: z.number().int().min(1).max(500).default(10),
    sidewaysPct: z.number().min(0).max(100).default(0.5),
    level: z.number().positive().finite().nullable().default(null),
    line: z.tuple([drawPoint, drawPoint]).nullable().default(null),
    tolerancePct: z.number().positive().max(50).default(0.5),
    minTouches: z.number().int().min(2).max(10).default(2),
  })
  .superRefine((d, ctx) => {
    const issue = (message: string, path: string) => ctx.addIssue({ code: "custom", message, path: [path] });
    if (d.visibleCount >= d.candles.length) issue(q.noFuture, "visibleCount");
    if (d.type === "MULTIPLE_CHOICE" && (d.options.length < 2 || !d.options.some((o) => o.id === d.correctOptionId))) {
      issue(q.optionsRule, "options");
    }
    if (d.type === "DRAW_LEVEL" && d.level === null) issue(q.needDrawing, "level");
    if (d.type === "DRAW_TRENDLINE" && d.line === null) issue(q.needDrawing, "line");
  });
export type QuestionInput = z.input<typeof questionInput>;

const dateTime = z.coerce.date();

export const examInput = z.object({
  title: text(150),
  description: optionalText(2000),
  durationMinutes: z.number().int().min(1, v.positive).max(1440),
  startsAt: dateTime,
  endsAt: dateTime,
  maxAttempts: z.number().int().min(1).max(20),
  shuffleQuestions: z.boolean(),
  shuffleOptions: z.boolean(),
  reviewPolicy: z.enum(["NEVER", "AFTER_SUBMIT", "AFTER_CLOSE", "AT_TIME"]),
  reviewAt: dateTime.nullable().default(null),
  questionIds: z.array(z.string()).max(200),
  points: z.record(z.string(), z.number().int().min(1).max(100)).default({}),
  groupIds: z.array(z.string()).max(200),
  studentIds: z.array(z.string()).max(2000),
});
export type ExamInput = z.input<typeof examInput>;

const drawing = z.object({
  tool: z.string().max(40),
  points: z.array(drawPoint).max(6),
});

export const responseSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("option"), optionId: z.string().max(20), drawings: z.array(drawing).max(30).optional() }),
  z.object({ kind: z.literal("direction"), direction: z.enum(["up", "down", "sideways"]), drawings: z.array(drawing).max(30).optional() }),
  z.object({ kind: z.literal("draw"), drawings: z.array(drawing).max(30) }),
  z.object({ kind: z.literal("none"), drawings: z.array(drawing).max(30).optional() }),
]);

export const saveAnswerInput = z.object({
  examQuestionId: z.string().max(40),
  response: responseSchema.nullable().optional(),
  flagged: z.boolean().optional(),
  /** Reported time since the last save; clamped by the server. */
  timeDeltaMs: z.number().int().min(0).max(3_600_000).default(0),
});

const FIELD_LABELS: Record<string, string> = {
  title: t.questions.fields.title,
  prompt: t.questions.fields.prompt,
  explanation: t.questions.fields.explanation,
  symbol: t.questions.symbol,
  fullName: t.students.fullName,
  name: t.landing.name,
  institute: t.landing.institute,
  orgName: t.admin.orgName,
  masterName: t.admin.masterName,
};

/** The message for the first problem, naming the field when "required" alone would be unclear. */
export function firstError(error: z.ZodError, labels: Record<string, string> = {}): string {
  const issue = error.issues[0];
  if (!issue?.message || issue.message.startsWith("Invalid")) return t.common.invalidInput;
  const field = String(issue.path[0] ?? "");
  const label = labels[field] ?? FIELD_LABELS[field];
  return label && issue.message === v.required ? `${label}: ${issue.message}` : issue.message;
}
