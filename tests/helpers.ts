import type { Candle } from "@/lib/candles";
import type { Actor, MasterActor } from "@/server/authz";
import { db } from "@/server/db";
import { publishExam, saveExamDraft } from "@/server/exams";
import { createQuestion } from "@/server/questions";
import { hashPassword } from "@/server/passwords";
import type { QuestionInput } from "@/lib/schemas";

export const T0 = new Date("2030-01-10T10:00:00Z");
export const minutes = (n: number) => n * 60_000;
export const at = (ms: number) => new Date(T0.getTime() + ms);

export async function resetDb() {
  await db.$executeRawUnsafe(
    `TRUNCATE "AuditLog","Answer","Attempt","ExamGroup","ExamStudent","ExamQuestion","Exam","QuestionTopic","Question","Topic","GroupMember","Group","RateLimit","InviteToken","Session","User","Organization","DemoRequest" CASCADE`,
  );
}

let seq = 0;
const PASSWORD_HASH = hashPassword("password123");

export async function makeUser(role: "MASTER" | "STUDENT", organizationId: string, extra: { username?: string; mustChangePassword?: boolean } = {}): Promise<Actor> {
  const username = extra.username ?? `${role.toLowerCase()}${++seq}`;
  const user = await db.user.create({
    data: { role, organizationId, username, fullName: username, passwordHash: await PASSWORD_HASH, mustChangePassword: extra.mustChangePassword ?? false },
  });
  return { id: user.id, role, organizationId };
}

export async function makeInstitute() {
  const org = await db.organization.create({ data: { name: `org${++seq}` } });
  const master = (await makeUser("MASTER", org.id)) as MasterActor;
  const student = await makeUser("STUDENT", org.id);
  return { org, master, student };
}

/** 40 visible candles near 100. The next 10 climb past FUTURE_SENTINEL_PRICE so they are easy to detect. */
export const FUTURE_SENTINEL_PRICE = 777777.77;
export const LEVEL_SENTINEL = 654321.5;
export const REAL_START = Date.UTC(2024, 2, 1);

export function makeCandles(): Candle[] {
  const out: Candle[] = [];
  for (let i = 0; i < 40; i++) {
    const wave = 100 + 5 * Math.sin(i / 3);
    out.push({ timestamp: REAL_START + i * 3_600_000, open: wave, high: wave + 1, low: wave - 1, close: wave, volume: 10 });
  }
  for (let i = 40; i < 50; i++) {
    const p = FUTURE_SENTINEL_PRICE;
    out.push({ timestamp: REAL_START + i * 3_600_000, open: p, high: p + 1, low: p - 1, close: p, volume: 10 });
  }
  return out;
}

export function baseQuestion(overrides: Partial<QuestionInput> = {}): QuestionInput {
  return {
    type: "MULTIPLE_CHOICE",
    title: "عنوان داخلی",
    prompt: "متن سؤال",
    explanation: "SECRET_EXPLANATION",
    difficulty: "MEDIUM",
    topics: ["حمایت و مقاومت"],
    symbol: "SECRETUSDT",
    timeframe: "1h",
    anonymize: true,
    candles: makeCandles(),
    visibleCount: 40,
    allowedTools: ["fibonacciLine"],
    options: [
      { id: "a", text: "گزینه الف" },
      { id: "b", text: "گزینه ب" },
    ],
    correctOptionId: "b",
    ...overrides,
  };
}

export async function makeExam(
  master: MasterActor,
  students: Actor[],
  questionInputs: QuestionInput[] = [baseQuestion()],
  overrides: Record<string, unknown> = {},
) {
  const questionIds: string[] = [];
  for (const input of questionInputs) questionIds.push(await createQuestion(master, input));
  const id = await saveExamDraft(master, null, {
    title: "آزمون آزمایشی",
    description: "",
    durationMinutes: 30,
    startsAt: T0,
    endsAt: at(minutes(120)),
    maxAttempts: 1,
    shuffleQuestions: false,
    shuffleOptions: false,
    reviewPolicy: "AFTER_CLOSE",
    questionIds,
    groupIds: [],
    studentIds: students.map((s) => s.id),
    ...overrides,
  });
  await publishExam(master, id, at(-minutes(60)));
  const eq = await db.examQuestion.findMany({ where: { examId: id }, orderBy: { position: "asc" } });
  return { id, questionIds, examQuestionIds: eq.map((q) => q.id) };
}
