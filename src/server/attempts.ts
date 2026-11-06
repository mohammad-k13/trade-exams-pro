import { randomInt } from "node:crypto";
import { attemptDeadline, canReview, canSeeScore, displayStatus, isExpired } from "@/lib/exam-rules";
import { grade, type StudentResponse } from "@/lib/grading";
import { t } from "@/lib/i18n";
import { firstError, saveAnswerInput } from "@/lib/schemas";
import type { Prisma } from "@/generated/prisma/client";
import { audit } from "./audit";
import { assertStudent, type Actor } from "./authz";
import { db } from "./db";
import { toReviewQuestion, toStudentQuestion, type ReviewQuestion, type StudentQuestion } from "./dto";
import { AppError, NotFoundError } from "./errors";
import type { QuestionSnapshot } from "./snapshot";

const s = t.student;

function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function assignedWhere(studentId: string): Prisma.ExamWhereInput {
  return {
    status: "PUBLISHED",
    deletedAt: null,
    OR: [
      { students: { some: { userId: studentId } } },
      { groups: { some: { group: { deletedAt: null, members: { some: { userId: studentId } } } } } },
    ],
  };
}

async function findAssignedExam(actor: Actor, examId: string) {
  const exam = await db.exam.findFirst({
    where: { id: examId, organizationId: actor.organizationId ?? undefined, ...assignedWhere(actor.id) },
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      durationMinutes: true,
      startsAt: true,
      endsAt: true,
      closedAt: true,
      maxAttempts: true,
      shuffleQuestions: true,
      shuffleOptions: true,
      reviewPolicy: true,
      reviewAt: true,
    },
  });
  if (!exam) throw new NotFoundError();
  return exam;
}

/**
 * Grades and closes one attempt. Safe to call repeatedly or concurrently: only the call that flips
 * status away from IN_PROGRESS does any work.
 */
export async function finalizeAttempt(attemptId: string, status: "SUBMITTED" | "TIMED_OUT", now: Date): Promise<boolean> {
  return db.$transaction(async (tx) => {
    const attempt = await tx.attempt.findUniqueOrThrow({ where: { id: attemptId }, select: { examId: true, deadlineAt: true } });
    const submittedAt = status === "TIMED_OUT" ? attempt.deadlineAt : now;
    const claimed = await tx.attempt.updateMany({
      where: { id: attemptId, status: "IN_PROGRESS" },
      data: { status, submittedAt },
    });
    if (claimed.count !== 1) return false;

    const questions = await tx.examQuestion.findMany({
      where: { examId: attempt.examId },
      select: { id: true, points: true, snapshot: true },
    });
    const answers = await tx.answer.findMany({ where: { attemptId } });
    const byQuestion = new Map(answers.map((a) => [a.examQuestionId, a]));

    let score = 0;
    let maxScore = 0;
    for (const q of questions) {
      const snap = q.snapshot as unknown as QuestionSnapshot;
      const answer = byQuestion.get(q.id);
      const result = grade(
        { answerKey: snap.answerKey, visibleCandles: snap.visibleCandles, futureCandles: snap.futureCandles },
        (answer?.response ?? null) as StudentResponse | null,
      );
      const points = result.isCorrect ? q.points : 0;
      score += points;
      maxScore += q.points;
      const fields = {
        isCorrect: result.isCorrect,
        points,
        gradingDetail: result.detail as unknown as Prisma.InputJsonValue,
      };
      await tx.answer.upsert({
        where: { attemptId_examQuestionId: { attemptId, examQuestionId: q.id } },
        update: fields,
        create: { attemptId, examQuestionId: q.id, ...fields },
      });
    }
    await tx.attempt.update({ where: { id: attemptId }, data: { score, maxScore } });
    return true;
    // Prisma's 5s default is too tight for a Neon cold start or a slow link, and a timed-out
    // transaction would leave the student's attempt ungraded.
  }, { maxWait: 15_000, timeout: 30_000 });
}

/** Serverless has no timer, so overdue attempts are closed whenever someone next looks at them. */
export async function finalizeExpiredForExam(examId: string, now = new Date()) {
  const overdue = await db.attempt.findMany({
    where: { examId, status: "IN_PROGRESS", deadlineAt: { lt: new Date(now.getTime() - 5_000) } },
    select: { id: true },
  });
  for (const a of overdue) await finalizeAttempt(a.id, "TIMED_OUT", now);
}

export async function finalizeExpiredForStudent(studentId: string, now = new Date()) {
  const overdue = await db.attempt.findMany({
    where: { studentId, status: "IN_PROGRESS", deadlineAt: { lt: new Date(now.getTime() - 5_000) } },
    select: { id: true },
  });
  for (const a of overdue) await finalizeAttempt(a.id, "TIMED_OUT", now);
}

export async function studentDashboard(actor: Actor, now = new Date()) {
  assertStudent(actor);
  await finalizeExpiredForStudent(actor.id, now);
  const exams = await db.exam.findMany({
    where: { organizationId: actor.organizationId ?? undefined, ...assignedWhere(actor.id) },
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      durationMinutes: true,
      startsAt: true,
      endsAt: true,
      closedAt: true,
      maxAttempts: true,
      reviewPolicy: true,
      reviewAt: true,
      attempts: {
        where: { studentId: actor.id },
        select: { id: true, number: true, status: true, score: true, maxScore: true, deadlineAt: true },
        orderBy: { number: "asc" },
      },
    },
    orderBy: { startsAt: "asc" },
  });

  return exams.map((exam) => {
    const finished = exam.attempts.filter((a) => a.status !== "IN_PROGRESS");
    const inProgress = exam.attempts.find((a) => a.status === "IN_PROGRESS") ?? null;
    const showScore = canSeeScore(exam, finished.length, !!inProgress, now);
    const lastFinished = finished.at(-1) ?? null;
    return {
      id: exam.id,
      title: exam.title,
      durationMinutes: exam.durationMinutes,
      startsAt: exam.startsAt,
      endsAt: exam.closedAt && exam.closedAt < exam.endsAt ? exam.closedAt : exam.endsAt,
      maxAttempts: exam.maxAttempts,
      reviewPolicy: exam.reviewPolicy,
      reviewAt: exam.reviewAt,
      displayStatus: displayStatus(exam, now),
      attemptsUsed: exam.attempts.length,
      inProgressId: inProgress?.id ?? null,
      lastFinishedId: lastFinished?.id ?? null,
      canReview: canReview(exam, finished.length, !!inProgress, now),
      score: showScore && lastFinished ? { score: lastFinished.score, maxScore: lastFinished.maxScore } : null,
    };
  });
}

export async function examLanding(actor: Actor, examId: string, now = new Date()) {
  assertStudent(actor);
  await finalizeExpiredForStudent(actor.id, now);
  const exam = await findAssignedExam(actor, examId);
  const attempts = await db.attempt.findMany({
    where: { examId, studentId: actor.id },
    select: { id: true, status: true },
    orderBy: { number: "asc" },
  });
  const questionCount = await db.examQuestion.count({ where: { examId } });
  const inProgress = attempts.find((a) => a.status === "IN_PROGRESS");
  const finished = attempts.filter((a) => a.status !== "IN_PROGRESS");
  return {
    id: exam.id,
    title: exam.title,
    description: exam.description,
    durationMinutes: exam.durationMinutes,
    startsAt: exam.startsAt,
    endsAt: exam.closedAt && exam.closedAt < exam.endsAt ? exam.closedAt : exam.endsAt,
    maxAttempts: exam.maxAttempts,
    reviewPolicy: exam.reviewPolicy,
    reviewAt: exam.reviewAt,
    questionCount,
    displayStatus: displayStatus(exam, now),
    attemptsUsed: attempts.length,
    inProgressId: inProgress?.id ?? null,
    lastFinishedId: finished.at(-1)?.id ?? null,
    canReview: canReview(exam, finished.length, !!inProgress, now),
  };
}

export async function startAttempt(actor: Actor, examId: string, now = new Date()): Promise<string> {
  assertStudent(actor);
  await finalizeExpiredForStudent(actor.id, now);
  const exam = await findAssignedExam(actor, examId);
  const existing = await db.attempt.findFirst({ where: { examId, studentId: actor.id, status: "IN_PROGRESS" }, select: { id: true } });
  if (existing) return existing.id;

  const state = displayStatus(exam, now);
  if (state === "scheduled") throw new AppError(s.notStarted, 409);
  if (state !== "active") throw new AppError(s.closed, 409);

  const used = await db.attempt.count({ where: { examId, studentId: actor.id } });
  if (used >= exam.maxAttempts) throw new AppError(s.noAttemptsLeft, 409);

  const questions = await db.examQuestion.findMany({
    where: { examId },
    select: { id: true, snapshot: true },
    orderBy: { position: "asc" },
  });
  const order = exam.shuffleQuestions ? shuffle(questions.map((q) => q.id)) : questions.map((q) => q.id);
  const optionOrder: Record<string, string[]> = {};
  for (const q of questions) {
    const options = (q.snapshot as unknown as QuestionSnapshot).options;
    if (options) optionOrder[q.id] = exam.shuffleOptions ? shuffle(options.map((o) => o.id)) : options.map((o) => o.id);
  }

  try {
    const attempt = await db.attempt.create({
      data: {
        examId,
        studentId: actor.id,
        number: used + 1,
        startedAt: now,
        deadlineAt: attemptDeadline(now, exam.durationMinutes, exam.endsAt),
        questionOrder: order,
        optionOrder,
      },
      select: { id: true },
    });
    await audit(actor, "attempt.started", { type: "attempt", id: attempt.id, meta: { exam: exam.title } });
    return attempt.id;
  } catch (e) {
    // Two tabs raced and hit the unique (exam, student, number). Use the attempt the other one created.
    if ((e as { code?: string }).code === "P2002") {
      const raced = await db.attempt.findFirst({ where: { examId, studentId: actor.id, status: "IN_PROGRESS" }, select: { id: true } });
      if (raced) return raced.id;
      throw new AppError(s.noAttemptsLeft, 409);
    }
    throw e;
  }
}

async function ownAttempt(actor: Actor, attemptId: string) {
  assertStudent(actor);
  const attempt = await db.attempt.findFirst({ where: { id: attemptId, studentId: actor.id } });
  if (!attempt) throw new NotFoundError();
  return attempt;
}

export interface AttemptView {
  attemptId: string;
  examTitle: string;
  finished: boolean;
  deadlineAt: string;
  serverNow: string;
  questions: StudentQuestion[];
  answers: Record<string, { response: unknown; flagged: boolean }>;
}

export async function getAttemptView(actor: Actor, attemptId: string, now = new Date()): Promise<AttemptView> {
  let attempt = await ownAttempt(actor, attemptId);
  if (attempt.status === "IN_PROGRESS" && isExpired(attempt.deadlineAt, now)) {
    await finalizeAttempt(attemptId, "TIMED_OUT", now);
    attempt = await ownAttempt(actor, attemptId);
  }
  const exam = await db.exam.findUniqueOrThrow({ where: { id: attempt.examId }, select: { title: true } });
  const view: AttemptView = {
    attemptId,
    examTitle: exam.title,
    finished: attempt.status !== "IN_PROGRESS",
    deadlineAt: attempt.deadlineAt.toISOString(),
    serverNow: now.toISOString(),
    questions: [],
    answers: {},
  };
  // Once finished, this view has no reason to carry question data; review has its own gate.
  if (view.finished) return view;

  const rows = await db.examQuestion.findMany({
    where: { examId: attempt.examId },
    select: { id: true, points: true, snapshot: true },
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  const optionOrder = attempt.optionOrder as Record<string, string[]>;
  view.questions = (attempt.questionOrder as string[]).flatMap((id) => {
    const row = byId.get(id);
    return row ? [toStudentQuestion(row.snapshot as unknown as QuestionSnapshot, id, row.points, optionOrder[id])] : [];
  });
  const answers = await db.answer.findMany({
    where: { attemptId },
    select: { examQuestionId: true, response: true, flagged: true },
  });
  for (const a of answers) view.answers[a.examQuestionId] = { response: a.response, flagged: a.flagged };
  return view;
}

/** Drops anything the question doesn't allow, so stored answers contain only legitimate input. */
function sanitizeResponse(raw: StudentResponse | null | undefined, snap: QuestionSnapshot): StudentResponse | null | undefined {
  if (raw === undefined || raw === null) return raw;
  const drawings = ("drawings" in raw ? (raw.drawings ?? []) : []).filter((d) => snap.allowedTools.includes(d.tool));
  switch (raw.kind) {
    case "option":
      if (snap.type !== "MULTIPLE_CHOICE" || !snap.options?.some((o) => o.id === raw.optionId)) {
        throw new AppError(t.common.invalidInput);
      }
      return { kind: "option", optionId: raw.optionId, drawings } as StudentResponse;
    case "direction":
      if (snap.type !== "DIRECTION") throw new AppError(t.common.invalidInput);
      return { kind: "direction", direction: raw.direction, drawings } as StudentResponse;
    default:
      return { kind: drawings.length && snap.type.startsWith("DRAW") ? "draw" : "none", drawings } as StudentResponse;
  }
}

export async function saveAnswer(actor: Actor, attemptId: string, raw: unknown, now = new Date()) {
  const attempt = await ownAttempt(actor, attemptId);
  const parsed = saveAnswerInput.safeParse(raw);
  if (!parsed.success) throw new AppError(firstError(parsed.error));
  const input = parsed.data;

  if (attempt.status !== "IN_PROGRESS") throw new AppError(t.attempt.expired, 409);
  if (isExpired(attempt.deadlineAt, now)) {
    await finalizeAttempt(attemptId, "TIMED_OUT", now);
    throw new AppError(t.attempt.expired, 409);
  }
  const question = await db.examQuestion.findFirst({
    where: { id: input.examQuestionId, examId: attempt.examId },
    select: { snapshot: true },
  });
  if (!question) throw new NotFoundError();
  const response = sanitizeResponse(input.response as StudentResponse | null | undefined, question.snapshot as unknown as QuestionSnapshot);

  const fields = {
    ...(response !== undefined ? { response: (response ?? undefined) as Prisma.InputJsonValue | undefined } : {}),
    ...(input.flagged !== undefined ? { flagged: input.flagged } : {}),
  };
  await db.answer.upsert({
    where: { attemptId_examQuestionId: { attemptId, examQuestionId: input.examQuestionId } },
    update: { ...fields, timeSpentMs: { increment: input.timeDeltaMs } },
    create: { attemptId, examQuestionId: input.examQuestionId, ...fields, timeSpentMs: input.timeDeltaMs },
  });
  return { serverNow: now.toISOString(), deadlineAt: attempt.deadlineAt.toISOString() };
}

export async function submitAttempt(actor: Actor, attemptId: string, now = new Date()) {
  const attempt = await ownAttempt(actor, attemptId);
  if (attempt.status !== "IN_PROGRESS") return;
  const status = isExpired(attempt.deadlineAt, now) ? "TIMED_OUT" : "SUBMITTED";
  const did = await finalizeAttempt(attemptId, status, now);
  if (did) await audit(actor, "attempt.submitted", { type: "attempt", id: attemptId, meta: { status } });
}

export interface TopicStat {
  id: string;
  name: string;
  correct: number;
  total: number;
}

export function topicStats(questions: ReviewQuestion[]): TopicStat[] {
  const map = new Map<string, TopicStat>();
  for (const q of questions) {
    for (const topic of q.topics) {
      const row = map.get(topic.id) ?? { id: topic.id, name: topic.name, correct: 0, total: 0 };
      row.total++;
      if (q.isCorrect) row.correct++;
      map.set(topic.id, row);
    }
  }
  return [...map.values()].sort((a, b) => a.correct / a.total - b.correct / b.total);
}

export interface AttemptReview {
  allowed: true;
  examTitle: string;
  studentName: string;
  score: number;
  maxScore: number;
  status: string;
  submittedAt: Date | null;
  questions: ReviewQuestion[];
  topics: TopicStat[];
}

export type StudentReview =
  | AttemptReview
  | {
      allowed: false;
      examTitle: string;
      reason: "in_progress" | "after_close" | "after_attempts" | "at_time" | "never";
      reviewAt: Date | null;
      score: { score: number | null; maxScore: number | null } | null;
    };

export async function buildAttemptReview(attemptId: string, examId: string): Promise<Omit<AttemptReview, "allowed" | "examTitle" | "studentName">> {
  const attempt = await db.attempt.findUniqueOrThrow({
    where: { id: attemptId },
    include: { answers: { select: { examQuestionId: true, response: true, isCorrect: true, points: true, gradingDetail: true } } },
  });
  const rows = await db.examQuestion.findMany({ where: { examId }, select: { id: true, points: true, snapshot: true } });
  const answers = new Map(attempt.answers.map((a) => [a.examQuestionId, a]));
  const byId = new Map(rows.map((r) => [r.id, r]));
  const questions = (attempt.questionOrder as string[]).flatMap((id) => {
    const row = byId.get(id);
    return row ? [toReviewQuestion(row.snapshot as unknown as QuestionSnapshot, id, row.points, answers.get(id))] : [];
  });
  return {
    score: attempt.score ?? 0,
    maxScore: attempt.maxScore ?? 0,
    status: attempt.status,
    submittedAt: attempt.submittedAt,
    questions,
    topics: topicStats(questions),
  };
}

/** The single gate for answers and hidden candles reaching a student. */
export async function getStudentReview(actor: Actor, attemptId: string, now = new Date()): Promise<StudentReview> {
  let attempt = await ownAttempt(actor, attemptId);
  if (attempt.status === "IN_PROGRESS" && isExpired(attempt.deadlineAt, now)) {
    await finalizeAttempt(attemptId, "TIMED_OUT", now);
    attempt = await ownAttempt(actor, attemptId);
  }
  const exam = await db.exam.findUniqueOrThrow({
    where: { id: attempt.examId },
    select: { title: true, status: true, startsAt: true, endsAt: true, closedAt: true, maxAttempts: true, reviewPolicy: true, reviewAt: true },
  });
  const all = await db.attempt.findMany({ where: { examId: attempt.examId, studentId: actor.id }, select: { status: true } });
  const finished = all.filter((a) => a.status !== "IN_PROGRESS").length;
  const inProgress = all.some((a) => a.status === "IN_PROGRESS");

  if (attempt.status === "IN_PROGRESS" || !canReview(exam, finished, inProgress, now)) {
    const closed = displayStatus(exam, now) === "closed";
    let reason: "in_progress" | "after_close" | "after_attempts" | "at_time" | "never";
    if (attempt.status === "IN_PROGRESS") reason = "in_progress";
    else if (exam.reviewPolicy === "NEVER") reason = "never";
    else if (exam.reviewPolicy === "AFTER_CLOSE") reason = "after_close";
    else if (exam.reviewPolicy === "AT_TIME" && exam.reviewAt && now < exam.reviewAt) reason = "at_time";
    else reason = closed ? "after_close" : "after_attempts";
    return {
      allowed: false,
      examTitle: exam.title,
      reason,
      reviewAt: exam.reviewAt,
      score: canSeeScore(exam, finished, inProgress, now) ? { score: attempt.score, maxScore: attempt.maxScore } : null,
    };
  }
  const review = await buildAttemptReview(attemptId, attempt.examId);
  const student = await db.user.findUniqueOrThrow({ where: { id: actor.id }, select: { fullName: true } });
  return { allowed: true, examTitle: exam.title, studentName: student.fullName, ...review };
}
