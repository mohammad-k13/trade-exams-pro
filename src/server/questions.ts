import { TIMEFRAMES, isValidCandle, type Candle } from "@/lib/candles";
import { pivotsOnLine, type AnswerKey } from "@/lib/grading";
import { t } from "@/lib/i18n";
import { MAX_CANDLES, firstError, questionInput } from "@/lib/schemas";
import { Prisma } from "@/generated/prisma/client";
import { audit } from "./audit";
import { assertMaster, type Actor } from "./authz";
import { db } from "./db";
import { AppError, NotFoundError } from "./errors";
import { hit } from "./rate-limit";

const q = t.questions;

export interface QuestionFilters {
  topicId?: string;
  type?: string;
  difficulty?: string;
  search?: string;
}

export async function listQuestions(actor: Actor, f: QuestionFilters = {}) {
  assertMaster(actor);
  return db.question.findMany({
    where: {
      organizationId: actor.organizationId,
      deletedAt: null,
      ...(f.topicId ? { topics: { some: { topicId: f.topicId } } } : {}),
      ...(f.type ? { type: f.type as never } : {}),
      ...(f.difficulty ? { difficulty: f.difficulty as never } : {}),
      ...(f.search ? { title: { contains: f.search, mode: "insensitive" as const } } : {}),
    },
    select: {
      id: true,
      title: true,
      type: true,
      difficulty: true,
      symbol: true,
      timeframe: true,
      updatedAt: true,
      topics: { select: { topic: { select: { id: true, name: true } } } },
      _count: { select: { examQuestions: true } },
    },
    orderBy: { updatedAt: "desc" },
  });
}

export async function listTopics(actor: Actor) {
  assertMaster(actor);
  return db.topic.findMany({ where: { organizationId: actor.organizationId }, orderBy: { name: "asc" } });
}

export async function getQuestion(actor: Actor, id: string) {
  assertMaster(actor);
  const question = await db.question.findFirst({
    where: { id, organizationId: actor.organizationId, deletedAt: null },
    include: { topics: { include: { topic: true } } },
  });
  if (!question) throw new NotFoundError();
  return question;
}

function buildData(raw: unknown) {
  const parsed = questionInput.safeParse(raw);
  if (!parsed.success) throw new AppError(firstError(parsed.error));
  const d = parsed.data;
  if (!d.candles.every(isValidCandle)) throw new AppError(t.common.invalidInput);
  const candles = [...d.candles].sort((a, b) => a.timestamp - b.timestamp);
  const visibleCandles = candles.slice(0, d.visibleCount);
  const futureCandles = candles.slice(d.visibleCount);

  let answerKey: AnswerKey;
  switch (d.type) {
    case "MULTIPLE_CHOICE":
      answerKey = { type: d.type, correctOptionId: d.correctOptionId! };
      break;
    case "DIRECTION":
      answerKey = { type: d.type, horizon: d.horizon, sidewaysPct: d.sidewaysPct };
      break;
    case "DRAW_LEVEL":
      answerKey = { type: d.type, price: d.level!, tolerancePct: d.tolerancePct };
      break;
    case "DRAW_TRENDLINE": {
      const pivots = pivotsOnLine(visibleCandles, d.line!, d.tolerancePct).map(({ index, price }) => ({ index, price }));
      if (pivots.length < d.minTouches) throw new AppError(q.pivotsTooFew);
      answerKey = { type: d.type, line: d.line!, pivots, minTouches: d.minTouches, tolerancePct: d.tolerancePct };
      break;
    }
  }

  // Drawing questions always include the tool needed to answer them.
  const tools = new Set<string>(d.allowedTools);
  if (d.type === "DRAW_LEVEL") tools.add("horizontalStraightLine");
  if (d.type === "DRAW_TRENDLINE" && !["straightLine", "rayLine", "segment"].some((x) => tools.has(x))) {
    tools.add("straightLine");
  }

  return {
    data: {
      type: d.type,
      title: d.title,
      prompt: d.prompt,
      explanation: d.explanation,
      difficulty: d.difficulty,
      symbol: d.symbol.toUpperCase(),
      timeframe: d.timeframe,
      anonymize: d.anonymize,
      visibleCandles: visibleCandles as unknown as Prisma.InputJsonValue,
      futureCandles: futureCandles as unknown as Prisma.InputJsonValue,
      allowedTools: [...tools],
      options: d.type === "MULTIPLE_CHOICE" ? (d.options as Prisma.InputJsonValue) : Prisma.DbNull,
      answerKey: answerKey as unknown as Prisma.InputJsonValue,
    },
    topics: [...new Set(d.topics)],
  };
}

async function topicLinks(organizationId: string, names: string[]) {
  const links: { topicId: string }[] = [];
  for (const name of names) {
    const topic = await db.topic.upsert({
      where: { organizationId_name: { organizationId, name } },
      update: {},
      create: { organizationId, name },
    });
    links.push({ topicId: topic.id });
  }
  return links;
}

export async function createQuestion(actor: Actor, raw: unknown) {
  assertMaster(actor);
  const { data, topics } = buildData(raw);
  const question = await db.question.create({
    data: {
      ...data,
      organizationId: actor.organizationId,
      createdById: actor.id,
      topics: { create: await topicLinks(actor.organizationId, topics) },
    },
    select: { id: true, title: true },
  });
  await audit(actor, "question.created", { type: "question", id: question.id, meta: { title: question.title } });
  return question.id;
}

export async function updateQuestion(actor: Actor, id: string, raw: unknown) {
  assertMaster(actor);
  await getQuestion(actor, id);
  const { data, topics } = buildData(raw);
  const links = await topicLinks(actor.organizationId, topics);
  await db.$transaction([
    db.questionTopic.deleteMany({ where: { questionId: id } }),
    db.question.update({ where: { id }, data: { ...data, topics: { create: links } } }),
  ]);
  await audit(actor, "question.updated", { type: "question", id, meta: { title: data.title } });
}

export async function duplicateQuestion(actor: Actor, id: string) {
  assertMaster(actor);
  const source = await getQuestion(actor, id);
  const copy = await db.question.create({
    data: {
      organizationId: actor.organizationId,
      createdById: actor.id,
      type: source.type,
      title: `${source.title} (کپی)`,
      prompt: source.prompt,
      explanation: source.explanation,
      difficulty: source.difficulty,
      symbol: source.symbol,
      timeframe: source.timeframe,
      anonymize: source.anonymize,
      visibleCandles: source.visibleCandles as Prisma.InputJsonValue,
      futureCandles: source.futureCandles as Prisma.InputJsonValue,
      allowedTools: source.allowedTools,
      options: source.options === null ? Prisma.DbNull : (source.options as Prisma.InputJsonValue),
      answerKey: source.answerKey as Prisma.InputJsonValue,
      topics: { create: source.topics.map((x) => ({ topicId: x.topicId })) },
    },
  });
  await audit(actor, "question.duplicated", { type: "question", id: copy.id, meta: { title: copy.title } });
  return copy.id;
}

export async function deleteQuestion(actor: Actor, id: string) {
  assertMaster(actor);
  const question = await getQuestion(actor, id);
  await db.question.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit(actor, "question.deleted", { type: "question", id, meta: { title: question.title } });
}

/** Market-data-only host: public, needs no key, and is less often geo-blocked than api.binance.com. */
const BINANCE_URL = "https://data-api.binance.vision/api/v3/klines";

export async function fetchBinanceCandles(
  actor: Actor,
  input: { symbol: string; timeframe: string; from: number; to: number },
): Promise<Candle[]> {
  assertMaster(actor);
  if (!(await hit(`binance:${actor.id}`, 30, 60_000))) throw new AppError(t.common.rateLimited, 429);
  const symbol = input.symbol.trim().toUpperCase();
  const interval = TIMEFRAMES[input.timeframe];
  if (!/^[A-Z0-9]{2,20}$/.test(symbol) || !interval || !(input.from < input.to)) throw new AppError(t.common.invalidInput);
  if ((input.to - input.from) / interval > MAX_CANDLES) throw new AppError(q.tooManyCandles);

  const url = `${BINANCE_URL}?symbol=${symbol}&interval=${input.timeframe}&startTime=${input.from}&endTime=${input.to}&limit=${MAX_CANDLES}`;
  let rows: unknown;
  let status: number | null = null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000), cache: "no-store" });
    status = res.status;
    if (!res.ok) throw new Error(String(res.status));
    rows = await res.json();
  } catch {
    // 451 and 403 are Binance's regional restriction. Retrying won't help, so point to CSV.
    throw new AppError(status === 451 || status === 403 ? q.binanceBlocked : q.binanceError, 502);
  }
  if (!Array.isArray(rows)) throw new AppError(q.binanceError, 502);
  return rows.map((r: string[]) => ({
    timestamp: Number(r[0]),
    open: Number(r[1]),
    high: Number(r[2]),
    low: Number(r[3]),
    close: Number(r[4]),
    volume: Number(r[5]),
  }));
}
