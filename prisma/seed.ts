// Demo data: one institute, one master, ten students and three exams with realistic results.
// Answers go through the real attempt services, so every grade comes from the real grading engine.
import "dotenv/config"; // must stay first: the database client reads DATABASE_URL on import
import fs from "node:fs";
import path from "node:path";
import { atr, findPivots, pricePrecision, suggestTolerancePct, type Candle } from "../src/lib/candles";
import { lineValueAt, pivotsOnLine, type DrawPoint } from "../src/lib/grading";
import { toFaDigits } from "../src/lib/format";
import type { QuestionInput } from "../src/lib/schemas";
import { saveAnswer, startAttempt, submitAttempt } from "../src/server/attempts";
import type { Actor, MasterActor } from "../src/server/authz";
import { db } from "../src/server/db";
import { publishExam, saveExamDraft } from "../src/server/exams";
import { hashPassword } from "../src/server/passwords";
import { createQuestion } from "../src/server/questions";
import { saveGroup } from "../src/server/students";

const DAY = 86_400_000;
const T = { sr: "حمایت و مقاومت", trend: "روند", ob: "اردر بلاک", fvg: "FVG", risk: "مدیریت ریسک" };

// Deterministic randomness, so the demo looks the same every time it is seeded.
let state = 20261106;
function rand() {
  state = (state + 0x6d2b79f5) | 0;
  let x = Math.imul(state ^ (state >>> 15), 1 | state);
  x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
  return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
}
const between = (a: number, b: number) => a + rand() * (b - a);

function load(file: string): Candle[] {
  const rows: number[][] = JSON.parse(fs.readFileSync(path.join(__dirname, "seed-data", `${file}.json`), "utf8"));
  return rows.map(([timestamp, open, high, low, close, volume]) => ({ timestamp, open, high, low, close, volume }));
}

interface Source {
  symbol: string;
  timeframe: string;
  candles: Candle[];
}
// Real public candles from Kraken, saved once so seeding works offline.
const SOURCES: Source[] = [
  { symbol: "BTCUSD", timeframe: "4h", candles: load("BTCUSD-4h") },
  { symbol: "ETHUSD", timeframe: "1h", candles: load("ETHUSD-1h") },
  { symbol: "SOLUSD", timeframe: "1d", candles: load("SOLUSD-1d") },
  { symbol: "ADAUSD", timeframe: "4h", candles: load("ADAUSD-4h") },
  { symbol: "XRPUSD", timeframe: "1h", candles: load("XRPUSD-1h") },
];

const VISIBLE = 90;
const FUTURE = 25;

function slice(source: Source, offset: number) {
  const part = source.candles.slice(offset, offset + VISIBLE + FUTURE);
  return { ...source, all: part, visible: part.slice(0, VISIBLE), future: part.slice(VISIBLE) };
}
type Window = ReturnType<typeof slice>;

const price = (w: Window, v: number) => toFaDigits(String(Number(v.toFixed(pricePrecision(w.visible))))).replace(".", "٫");
const range = (w: Window, lo: number, hi: number) => `${price(w, lo)} تا ${price(w, hi)}`;

function base(w: Window, topics: string[], difficulty: "EASY" | "MEDIUM" | "HARD") {
  return {
    symbol: w.symbol,
    timeframe: w.timeframe,
    candles: w.all,
    visibleCount: VISIBLE,
    topics,
    difficulty,
    anonymize: true,
    allowedTools: ["horizontalStraightLine", "straightLine", "fibonacciLine"] as ("horizontalStraightLine" | "straightLine" | "fibonacciLine")[],
  };
}

function options(correct: string, wrong: string[]) {
  const texts = [correct, ...wrong];
  const ids = ["a", "b", "c", "d"];
  // Rotate so the right answer isn't always first when an exam doesn't shuffle.
  const shift = Math.floor(rand() * texts.length);
  const opts = texts.map((text, i) => ({ id: ids[(i + shift) % texts.length], text })).sort((a, b) => a.id.localeCompare(b.id));
  return { options: opts, correctOptionId: ids[shift], wrongIds: wrong.map((_, i) => ids[(i + 1 + shift) % texts.length]) };
}

function directionQuestion(w: Window, title: string, difficulty: "EASY" | "MEDIUM" | "HARD"): QuestionInput {
  return {
    ...base(w, [T.trend], difficulty),
    type: "DIRECTION",
    title,
    prompt: "با توجه به ساختار این چارت، قیمت پس از ۱۰ کندل بعدی نسبت به آخرین قیمت بسته‌شدن به کدام سمت رفته است؟",
    explanation: "پاسخ از کندل‌های پنهان محاسبه شده است. به آخرین موج‌ها و محل بسته‌شدن قیمت نسبت به سقف و کف‌های اخیر دقت کنید.",
    horizon: 10,
    sidewaysPct: 0.5,
  };
}

function levelQuestion(w: Window, kind: "support" | "resistance", title: string, difficulty: "EASY" | "MEDIUM" | "HARD"): QuestionInput {
  const pivots = findPivots(w.visible).filter((p) => p.kind === (kind === "support" ? "low" : "high"));
  const level = kind === "support" ? Math.min(...pivots.map((p) => p.price)) : Math.max(...pivots.map((p) => p.price));
  return {
    ...base(w, [T.sr], difficulty),
    type: "DRAW_LEVEL",
    title,
    prompt: kind === "support"
      ? "پایین‌ترین کف چرخشی این بازه را به‌عنوان حمایت اصلی با یک خط افقی مشخص کنید."
      : "بالاترین سقف چرخشی این بازه را به‌عنوان مقاومت اصلی با یک خط افقی مشخص کنید.",
    explanation: `سطح درست ${price(w, level)} است؛ ${kind === "support" ? "پایین‌ترین کف" : "بالاترین سقف"} چرخشی بازه. کف یا سقف چرخشی کندلی است که از سه کندل هر طرف خود پایین‌تر یا بالاتر باشد.`,
    level,
    tolerancePct: suggestTolerancePct(w.visible),
  };
}

/** The ascending line through swing lows that touches the most pivots and no close falls below. */
function bestTrendline(w: Window): { line: [DrawPoint, DrawPoint]; tolerancePct: number; touches: number } | null {
  const tol = suggestTolerancePct(w.visible);
  const lows = findPivots(w.visible).filter((p) => p.kind === "low");
  let best: { line: [DrawPoint, DrawPoint]; tolerancePct: number; touches: number } | null = null;
  for (let i = 0; i < lows.length; i++) {
    for (let j = i + 1; j < lows.length; j++) {
      if (lows[j].price <= lows[i].price || lows[j].index - lows[i].index < 10) continue;
      const line: [DrawPoint, DrawPoint] = [{ index: lows[i].index, price: lows[i].price }, { index: lows[j].index, price: lows[j].price }];
      const broken = w.visible.some((c, k) => k > lows[i].index && k < lows[j].index && c.close < lineValueAt("straightLine", line[0], line[1], k)!);
      if (broken) continue;
      const touches = pivotsOnLine(w.visible, line, tol).length;
      if (!best || touches > best.touches) best = { line, tolerancePct: tol, touches };
    }
  }
  return best;
}

function findWindow(source: Source, test: (w: Window) => boolean, start = 0): Window {
  for (let offset = start; offset + VISIBLE + FUTURE <= source.candles.length; offset += 7) {
    const w = slice(source, offset);
    if (test(w)) return w;
  }
  throw new Error(`No suitable window in ${source.symbol}`);
}

function trendlineQuestion(source: Source, start: number, title: string): QuestionInput {
  const w = findWindow(source, (x) => (bestTrendline(x)?.touches ?? 0) >= 2, start);
  const t = bestTrendline(w)!;
  return {
    ...base(w, [T.trend], "HARD"),
    allowedTools: ["straightLine", "horizontalStraightLine"],
    type: "DRAW_TRENDLINE",
    title,
    prompt: "خط روند صعودی را از روی کف‌های چرخشی این بازه رسم کنید.",
    explanation: "خط روند صعودی باید کف‌های بالارونده را به هم وصل کند و قیمت بین آن‌ها زیر خط بسته نشود. نقطه‌های سبز، کف‌هایی هستند که خط درست از آن‌ها می‌گذرد.",
    line: t.line,
    tolerancePct: t.tolerancePct,
    minTouches: 2,
  };
}

function trendMcq(w: Window, title: string): QuestionInput & { wrongIds: string[] } {
  const avg = (list: Candle[]) => list.reduce((n, c) => n + c.close, 0) / list.length;
  const change = ((avg(w.visible.slice(-20)) - avg(w.visible.slice(0, 20))) / avg(w.visible.slice(0, 20))) * 100;
  const label = (d: string) => ({ up: "صعودی", down: "نزولی", side: "خنثی" })[d]!;
  const correct = change > 2 ? "up" : change < -2 ? "down" : "side";
  const o = options(label(correct), ["up", "down", "side"].filter((d) => d !== correct).map(label));
  return {
    ...base(w, [T.trend], "EASY"),
    type: "MULTIPLE_CHOICE",
    title,
    prompt: "اگر میانگین قیمت بسته‌شدن ۲۰ کندل آخر بیش از ۲٪ از ۲۰ کندل اول بالاتر باشد روند صعودی، بیش از ۲٪ پایین‌تر نزولی و در غیر این صورت خنثی است. روند این بازه چیست؟",
    explanation: `میانگین ۲۰ کندل آخر نسبت به ۲۰ کندل اول ${toFaDigits(change.toFixed(2))}٪ تغییر کرده است.`,
    ...o,
  };
}

function largestFvg(w: Window) {
  let best: { index: number; lo: number; hi: number; size: number } | null = null;
  for (let i = 1; i < w.visible.length - 1; i++) {
    const lo = w.visible[i - 1].high;
    const hi = w.visible[i + 1].low;
    if (hi > lo && (!best || hi - lo > best.size)) best = { index: i, lo, hi, size: hi - lo };
  }
  return best;
}

function fvgQuestion(source: Source, start: number, title: string, difficulty: "MEDIUM" | "HARD"): QuestionInput & { wrongIds: string[] } {
  const w = findWindow(source, (x) => {
    const g = largestFvg(x);
    return !!g && g.size > atr(x.visible) * 0.3;
  }, start);
  const g = largestFvg(w)!;
  const pad = Math.max(g.size, atr(w.visible));
  const o = options(range(w, g.lo, g.hi), [
    range(w, g.hi + pad, g.hi + pad + g.size), // a look-alike zone above
    range(w, g.lo - pad - g.size, g.lo - pad), // and below
    range(w, w.visible[g.index].open < w.visible[g.index].close ? w.visible[g.index].open : w.visible[g.index].close, w.visible[g.index].high), // the impulse candle, a common mistake
  ]);
  return {
    ...base(w, [T.fvg], difficulty),
    type: "MULTIPLE_CHOICE",
    title,
    prompt: "شکاف ارزش منصفانه‌ی صعودی جایی است که کف کندل سوم بالاتر از سقف کندل اول باشد. بزرگ‌ترین FVG صعودی این بازه در کدام محدوده است؟",
    explanation: `بزرگ‌ترین شکاف بین سقف کندل اول (${price(w, g.lo)}) و کف کندل سوم (${price(w, g.hi)}) قرار دارد. بدنه‌ی کندل میانی خود FVG نیست.`,
    ...o,
  };
}

function orderBlockQuestion(source: Source, start: number, title: string): QuestionInput & { wrongIds: string[] } {
  const find = (x: Window) => {
    let best: { index: number; move: number } | null = null;
    for (let i = 1; i < x.visible.length - 3; i++) {
      const c = x.visible[i];
      if (c.close >= c.open) continue;
      const move = x.visible[i + 3].close - c.close;
      if (x.visible[i + 1].close > c.close && (!best || move > best.move)) best = { index: i, move };
    }
    return best;
  };
  const w = findWindow(source, (x) => {
    const b = find(x);
    return !!b && b.index >= 5 && b.move > atr(x.visible) * 1.5;
  }, start);
  const b = find(w)!;
  const c = w.visible[b.index];
  const after = w.visible[b.index + 2];
  const before = w.visible[b.index - 4];
  const far = w.visible[b.index - 2];
  const o = options(range(w, c.low, c.high), [range(w, after.low, after.high), range(w, before.low, before.high), range(w, far.low, far.high)]);
  return {
    ...base(w, [T.ob], "HARD"),
    type: "MULTIPLE_CHOICE",
    title,
    prompt: "در این آزمون، اردر بلاک صعودی آخرین کندل نزولی پیش از قوی‌ترین حرکت سه‌کندلی صعودی بازه است. محدوده‌ی این اردر بلاک کدام است؟",
    explanation: `کندل نزولی پیش از قوی‌ترین حرکت صعودی، از ${price(w, c.low)} تا ${price(w, c.high)} است. کندل‌های داخل خود حرکت، اردر بلاک نیستند.`,
    ...o,
  };
}

function positionSizeQuestion(w: Window, title: string): QuestionInput & { wrongIds: string[] } {
  const entry = w.visible.at(-1)!.close;
  const stop = entry - atr(w.visible) * 1.5;
  const units = 100 / (entry - stop);
  const fmt = (n: number) => toFaDigits(n.toPrecision(3)).replace(".", "٫");
  const o = options(`${fmt(units)} واحد`, [`${fmt(units * 2)} واحد`, `${fmt(10000 / entry)} واحد`, `${fmt(units / 2)} واحد`]);
  return {
    ...base(w, [T.risk], "MEDIUM"),
    type: "MULTIPLE_CHOICE",
    title,
    prompt: `سرمایه ۱۰٬۰۰۰ دلار و ریسک هر معامله ۱٪ است. با ورود روی ${price(w, entry)} و حد ضرر روی ${price(w, stop)}، حجم معامله چقدر باید باشد؟`,
    explanation: "حجم = مبلغ ریسک ÷ فاصله تا حد ضرر. مبلغ ریسک ۱۰۰ دلار است. تقسیم کل سرمایه بر قیمت، حجم را بدون درنظرگرفتن حد ضرر می‌دهد و اشتباه رایجی است.",
    ...o,
  };
}

function rewardQuestion(w: Window, title: string): QuestionInput & { wrongIds: string[] } {
  const entry = w.visible.at(-1)!.close;
  const risk = atr(w.visible);
  const stop = entry - risk;
  const target = entry + risk * 3;
  const o = options("۱ به ۳", ["۱ به ۲", "۳ به ۱", "۱ به ۴"]);
  return {
    ...base(w, [T.risk], "EASY"),
    type: "MULTIPLE_CHOICE",
    title,
    prompt: `ورود ${price(w, entry)}، حد ضرر ${price(w, stop)} و حد سود ${price(w, target)} است. نسبت ریسک به ریوارد چقدر است؟`,
    explanation: "فاصله تا حد سود سه برابر فاصله تا حد ضرر است، پس نسبت ریسک به ریوارد ۱ به ۳ است.",
    ...o,
  };
}

const NAMES = ["نگار احمدی", "امیر رضایی", "سارا محمدی", "پویا کریمی", "مریم حسینی", "کیان موسوی", "الهام جعفری", "رضا صادقی", "شیما نوری", "حامد اکبری"];

/** Chance of a correct answer per topic. FVG and order blocks are the class's planted weak spots. */
function skills(level: number): Record<string, number> {
  return {
    [T.sr]: Math.min(0.95, level + 0.15),
    [T.trend]: Math.min(0.95, level + 0.05),
    [T.risk]: Math.min(0.95, level),
    [T.fvg]: Math.max(0.1, level - 0.35),
    [T.ob]: Math.max(0.1, level - 0.3),
  };
}
const LEVELS = [0.85, 0.8, 0.75, 0.7, 0.7, 0.6, 0.55, 0.5, 0.42, 0.35];

type Prepared = { id: string; input: QuestionInput & { wrongIds?: string[] } };

function responseFor(q: Prepared, right: boolean) {
  const input = q.input;
  switch (input.type) {
    case "MULTIPLE_CHOICE": {
      if (right) return { kind: "option", optionId: input.correctOptionId };
      // Most wrong answers cluster on one distractor, as they do in real classes.
      const wrong = input.wrongIds!;
      return { kind: "option", optionId: rand() < 0.65 ? wrong[0] : wrong[Math.floor(rand() * wrong.length)] };
    }
    case "DIRECTION": {
      const visible = input.candles.slice(0, input.visibleCount!);
      const base2 = visible.at(-1)!.close;
      const target = input.candles[input.visibleCount! + 9].close;
      const pct = ((target - base2) / base2) * 100;
      const correct = pct > 0.5 ? "up" : pct < -0.5 ? "down" : "sideways";
      const others = ["up", "down", "sideways"].filter((d) => d !== correct);
      return { kind: "direction", direction: right ? correct : others[rand() < 0.75 ? 0 : 1] };
    }
    case "DRAW_LEVEL": {
      const tol = input.tolerancePct!;
      const err = right ? between(-0.7, 0.7) * tol : (rand() < 0.5 ? -1 : 1) * between(1.6, 4) * tol;
      return { kind: "draw", drawings: [{ tool: "horizontalStraightLine", points: [{ index: 45, price: input.level! * (1 + err / 100) }] }] };
    }
    case "DRAW_TRENDLINE": {
      const [a, b] = input.line!;
      const tol = input.tolerancePct!;
      const err = right ? between(-0.4, 0.4) * tol : between(2.5, 5) * tol;
      return {
        kind: "draw",
        drawings: [{ tool: "straightLine", points: [{ index: a.index, price: a.price * (1 + err / 100) }, { index: b.index, price: b.price * (1 - (right ? 0 : err) / 100) }] }],
      };
    }
  }
}

async function main() {
  // A laptop seeding Neon has no NODE_ENV, so anything that isn't a local database counts as production.
  const local = /@(localhost|127\.0\.0\.1|\[::1\]|db)(:|\/)/.test(process.env.DATABASE_URL ?? "");
  const production = !local || process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
  if (production && process.env.SEED_RESET === "1") throw new Error("SEED_RESET is refused on a non-local database.");
  const password = process.env.SEED_PASSWORD || (production ? "" : "demo-password-1");
  if (!password) throw new Error("Set SEED_PASSWORD to seed a non-local database.");
  if (production && password.length < 12) throw new Error("SEED_PASSWORD must be at least 12 characters on a non-local database.");

  if (await db.user.findFirst({ where: { role: "ADMIN" } })) {
    if (process.env.SEED_RESET !== "1") {
      console.log("Database already has data; nothing changed. On a local database, SEED_RESET=1 wipes and reseeds.");
      return;
    }
    await db.$executeRawUnsafe(
      `TRUNCATE "AuditLog","Answer","Attempt","ExamGroup","ExamStudent","ExamQuestion","Exam","QuestionTopic","Question","Topic","GroupMember","Group","RateLimit","InviteToken","Session","User","Organization","DemoRequest" CASCADE`,
    );
  }

  const passwordHash = await hashPassword(password);
  await db.user.create({ data: { role: "ADMIN", username: "admin", fullName: "مدیر سیستم", passwordHash } });
  const org = await db.organization.create({ data: { name: "آکادمی نمونه‌ی ترید" } });
  const masterUser = await db.user.create({
    data: { role: "MASTER", organizationId: org.id, username: "master", fullName: "استاد نمونه", passwordHash, onboardingDismissedAt: new Date() },
  });
  const master: MasterActor = { id: masterUser.id, role: "MASTER", organizationId: org.id };

  const students: (Actor & { level: number })[] = [];
  for (let i = 0; i < NAMES.length; i++) {
    const n = String(i + 1).padStart(2, "0");
    const u = await db.user.create({
      data: { role: "STUDENT", organizationId: org.id, username: `student${n}`, phone: `0912000${n}00`, fullName: NAMES[i], passwordHash },
    });
    students.push({ id: u.id, role: "STUDENT", organizationId: org.id, level: LEVELS[i] });
  }
  const groupA = await saveGroup(master, null, "کلاس فارکس مقدماتی", students.slice(0, 5).map((s) => s.id));
  const groupB = await saveGroup(master, null, "کلاس کریپتو پیشرفته", students.slice(5).map((s) => s.id));

  const [btc, eth, sol, ada, xrp] = SOURCES;
  const build = async (inputs: (QuestionInput & { wrongIds?: string[] })[]): Promise<Prepared[]> => {
    const prepared: Prepared[] = [];
    for (const input of inputs) {
      const { wrongIds, ...clean } = input;
      void wrongIds;
      prepared.push({ id: await createQuestion(master, clean), input });
    }
    return prepared;
  };

  const examOne = await build([
    trendMcq(slice(btc, 0), "روند کلی BTC"),
    levelQuestion(slice(eth, 20), "support", "حمایت اصلی ETH", "EASY"),
    levelQuestion(slice(ada, 40), "resistance", "مقاومت اصلی ADA", "MEDIUM"),
    directionQuestion(slice(sol, 60), "جهت قیمت SOL پس از اصلاح", "MEDIUM"),
    trendlineQuestion(btc, 120, "خط روند صعودی BTC"),
  ]);
  const examTwo = await build([
    fvgQuestion(eth, 100, "بزرگ‌ترین FVG در ETH", "MEDIUM"),
    orderBlockQuestion(btc, 200, "اردر بلاک صعودی BTC"),
    positionSizeQuestion(slice(xrp, 80), "محاسبه‌ی حجم معامله"),
    rewardQuestion(slice(ada, 150), "نسبت ریسک به ریوارد"),
    directionQuestion(slice(xrp, 200), "جهت قیمت XRP", "HARD"),
  ]);
  const examThree = await build([
    levelQuestion(slice(sol, 180), "support", "حمایت اصلی SOL", "MEDIUM"),
    directionQuestion(slice(btc, 280), "جهت قیمت BTC", "MEDIUM"),
    fvgQuestion(ada, 240, "بزرگ‌ترین FVG در ADA", "HARD"),
    orderBlockQuestion(eth, 300, "اردر بلاک صعودی ETH"),
    positionSizeQuestion(slice(btc, 350), "حجم معامله با حد ضرر ATR"),
    trendlineQuestion(xrp, 300, "خط روند صعودی XRP"),
  ]);

  const now = Date.now();
  const makeExam = async (title: string, description: string, questions: Prepared[], startsAt: number, endsAt: number, reviewPolicy: string, duration: number) => {
    const id = await saveExamDraft(master, null, {
      title,
      description,
      durationMinutes: duration,
      startsAt: new Date(startsAt),
      endsAt: new Date(endsAt),
      maxAttempts: 1,
      shuffleQuestions: false,
      shuffleOptions: true,
      reviewPolicy,
      questionIds: questions.map((q) => q.id),
      groupIds: [groupA, groupB],
      studentIds: [],
    });
    await publishExam(master, id, new Date(startsAt - DAY));
    const rows = await db.examQuestion.findMany({ where: { examId: id }, orderBy: { position: "asc" } });
    return { id, rows };
  };

  const take = async (exam: { id: string; rows: { id: string }[] }, questions: Prepared[], student: Actor & { level: number }, start: number, levelShift: number, finish = true) => {
    const attemptId = await startAttempt(student, exam.id, new Date(start));
    let clock = start;
    for (let i = 0; i < questions.length; i++) {
      const topic = questions[i].input.topics![0];
      const chance = Math.max(0.05, Math.min(0.97, skills(student.level + levelShift)[topic]));
      const spent = Math.round(between(25_000, 140_000) * (topic === T.fvg || topic === T.ob ? 1.5 : 1));
      clock += spent;
      if (!finish && i >= questions.length - 2) break;
      const skipped = rand() < 0.03;
      await saveAnswer(
        student,
        attemptId,
        { examQuestionId: exam.rows[i].id, timeDeltaMs: spent, ...(skipped ? {} : { response: responseFor(questions[i], rand() < chance) }) },
        new Date(clock),
      );
    }
    if (finish) await submitAttempt(student, attemptId, new Date(clock + 5_000));
  };

  // Exam 1, a month ago. Everyone but the last student took it.
  const e1 = await makeExam("آزمون میان‌دوره: روند و سطوح", "روند، حمایت و مقاومت و خط روند.", examOne, now - 30 * DAY, now - 29 * DAY, "AFTER_CLOSE", 30);
  for (const [i, s] of students.entries()) {
    if (i === 9) continue;
    await take(e1, examOne, s, now - 30 * DAY + (i + 1) * 3_600_000, -0.2);
  }

  // Exam 2, ten days ago. The class improves, but one student drops sharply.
  const e2 = await makeExam("آزمون اسمارت‌مانی و مدیریت ریسک", "FVG، اردر بلاک و محاسبه‌ی حجم.", examTwo, now - 10 * DAY, now - 9 * DAY, "AFTER_CLOSE", 30);
  for (const [i, s] of students.entries()) {
    await take(e2, examTwo, s, now - 10 * DAY + (i + 1) * 3_600_000, i === 6 ? -0.15 : 0.15);
  }

  // Exam 3 is open now. student01 and student02 are left free so a demo can take it live,
  // and review opens right after submit, so the reveal can be shown on the spot.
  const e3 = await makeExam("آزمون جامع این هفته", "همه‌ی مباحث دوره. پس از ثبت، نتیجه و ادامه‌ی چارت را می‌بینید.", examThree, now - DAY, now + 7 * DAY, "AFTER_SUBMIT", 45);
  for (const [i, s] of students.entries()) {
    if (i < 2) continue;
    if (i === 9) await take(e3, examThree, s, now - 5 * 60_000, 0, false); // still working
    else await take(e3, examThree, s, now - DAY + (i + 1) * 3_600_000, 0.3);
  }

  const counts = await db.attempt.groupBy({ by: ["examId"], _avg: { score: true, maxScore: true }, _count: { _all: true } });
  console.log("Seeded.", counts.map((c) => `${c._count._all} attempts, avg ${c._avg.score?.toFixed(2)}/${c._avg.maxScore?.toFixed(0)}`).join(" | "));
  console.log(`Logins: admin, master, student01 to student10. Password: ${process.env.SEED_PASSWORD ? "(your SEED_PASSWORD)" : password}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
