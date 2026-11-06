import { computeAnalytics, type AnswerFact, type ExamMeta, type StudentMeta } from "@/lib/analytics";
import { displayStatus } from "@/lib/exam-rules";
import type { Direction } from "@/lib/grading";
import { t } from "@/lib/i18n";
import { audit } from "./audit";
import { buildAttemptReview, finalizeExpiredForExam } from "./attempts";
import { assertMaster, type Actor } from "./authz";
import { db } from "./db";
import { NotFoundError } from "./errors";
import { assignedStudents } from "./exams";

type LightSnapshot = {
  title: string;
  options: { id: string; text: string }[] | null;
  topics: { id: string; name: string }[];
};

async function ownExam(actor: Actor, examId: string) {
  assertMaster(actor);
  const exam = await db.exam.findFirst({
    where: { id: examId, organizationId: actor.organizationId, deletedAt: null },
    select: { id: true, title: true, status: true, startsAt: true, endsAt: true, closedAt: true, durationMinutes: true },
  });
  if (!exam) throw new NotFoundError();
  return exam;
}

/** Candles are dropped in SQL because analytics never needs them and they are most of the row's size. */
async function lightQuestions(examIds: string[]) {
  if (!examIds.length) return [];
  return db.$queryRaw<{ id: string; examId: string; questionId: string; position: number; points: number; snapshot: LightSnapshot }[]>`
    SELECT id, "examId", "questionId", position, points,
           snapshot - 'visibleCandles' - 'futureCandles' - 'answerKey' AS snapshot
    FROM "ExamQuestion"
    WHERE "examId" = ANY(${examIds}) AND snapshot IS NOT NULL
    ORDER BY position`;
}

function choiceOf(response: unknown, snap: LightSnapshot): { id: string | null; text: string | null } {
  const r = response as { kind?: string; optionId?: string; direction?: Direction } | null;
  if (r?.kind === "option" && r.optionId) {
    return { id: r.optionId, text: snap.options?.find((o) => o.id === r.optionId)?.text ?? null };
  }
  if (r?.kind === "direction" && r.direction) return { id: r.direction, text: t.direction[r.direction] };
  return { id: null, text: null };
}

/** Each student's first finished attempt per exam: retakes would overstate what the class knew. */
async function loadFacts(examIds: string[], studentIds?: string[]): Promise<AnswerFact[]> {
  const questions = await lightQuestions(examIds);
  const meta = new Map(questions.map((q) => [q.id, q]));
  const attempts = await db.attempt.findMany({
    where: { examId: { in: examIds }, status: { not: "IN_PROGRESS" }, ...(studentIds ? { studentId: { in: studentIds } } : {}) },
    orderBy: { number: "asc" },
    select: {
      id: true,
      examId: true,
      studentId: true,
      answers: { select: { examQuestionId: true, response: true, isCorrect: true, points: true, timeSpentMs: true } },
    },
  });
  const seen = new Set<string>();
  const facts: AnswerFact[] = [];
  for (const attempt of attempts) {
    const key = `${attempt.examId}:${attempt.studentId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    for (const a of attempt.answers) {
      const q = meta.get(a.examQuestionId);
      if (!q) continue;
      const choice = choiceOf(a.response, q.snapshot);
      const kind = (a.response as { kind?: string } | null)?.kind;
      facts.push({
        examId: attempt.examId,
        examQuestionId: a.examQuestionId,
        questionId: q.questionId,
        title: q.snapshot.title,
        topics: q.snapshot.topics,
        studentId: attempt.studentId,
        correct: !!a.isCorrect,
        answered: !!kind && kind !== "none",
        choiceId: choice.id,
        choiceText: choice.text,
        timeSpentMs: a.timeSpentMs,
        points: a.points ?? 0,
        maxPoints: q.points,
      });
    }
  }
  return facts;
}

export async function getExamResults(actor: Actor, examId: string, now = new Date()) {
  const exam = await ownExam(actor, examId);
  await finalizeExpiredForExam(examId, now);
  const students = await assignedStudents(examId);
  const attempts = await db.attempt.findMany({
    where: { examId },
    orderBy: { number: "asc" },
    select: { id: true, studentId: true, number: true, status: true, startedAt: true, submittedAt: true, score: true, maxScore: true },
  });
  const rows = students.map((student) => {
    const own = attempts.filter((a) => a.studentId === student.id);
    const finished = own.filter((a) => a.status !== "IN_PROGRESS");
    // The reported grade is the student's best finished attempt.
    const best = [...finished].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0] ?? null;
    return { student, attempts: own, best, inProgress: own.some((a) => a.status === "IN_PROGRESS") };
  });
  const scored = rows.flatMap((r) => (r.best && r.best.maxScore ? [(r.best.score ?? 0) / r.best.maxScore] : []));
  const facts = await loadFacts([examId]);
  const meta: ExamMeta = {
    id: exam.id,
    title: exam.title,
    startsAt: exam.startsAt,
    closed: displayStatus(exam, now) === "closed",
    assignedStudentIds: students.map((s) => s.id),
  };
  return {
    exam: { ...exam, displayStatus: displayStatus(exam, now) },
    rows,
    participation: { done: scored.length, total: students.length },
    average: scored.length ? scored.reduce((a, b) => a + b, 0) / scored.length : null,
    analytics: computeAnalytics(facts, [meta], students.map((s) => ({ id: s.id, fullName: s.fullName }))),
  };
}

export async function getMasterAttemptReview(actor: Actor, attemptId: string, now = new Date()) {
  assertMaster(actor);
  const attempt = await db.attempt.findFirst({
    where: { id: attemptId, exam: { organizationId: actor.organizationId, deletedAt: null } },
    select: { id: true, examId: true, status: true, deadlineAt: true, student: { select: { fullName: true } }, exam: { select: { title: true } } },
  });
  if (!attempt) throw new NotFoundError();
  await finalizeExpiredForExam(attempt.examId, now);
  const review = await buildAttemptReview(attempt.id, attempt.examId);
  return { allowed: true as const, examId: attempt.examId, examTitle: attempt.exam.title, studentName: attempt.student.fullName, ...review };
}

/** A leading = + - or @ makes Excel run the cell as a formula, so those cells are prefixed. */
export function csvCell(value: string | number | null | undefined): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
}

export async function exportExamCsv(actor: Actor, examId: string, now = new Date()) {
  const { exam, rows } = await getExamResults(actor, examId, now);
  const r = t.results;
  const questions = await lightQuestions([examId]);
  const attemptIds = rows.flatMap((x) => (x.best ? [x.best.id] : []));
  const answers = await db.answer.findMany({
    where: { attemptId: { in: attemptIds } },
    select: { attemptId: true, examQuestionId: true, isCorrect: true },
  });
  const lookup = new Map(answers.map((a) => [`${a.attemptId}:${a.examQuestionId}`, a.isCorrect]));

  const header = [r.student, t.students.username, r.status, r.score, "حداکثر نمره", r.percent, r.submittedAt, ...questions.map((q) => q.snapshot.title)];
  const body = rows.map(({ student, best, inProgress }) => [
    student.fullName,
    student.username,
    best ? r.attemptStatus[best.status] : inProgress ? r.attemptStatus.IN_PROGRESS : r.notAttempted,
    best?.score ?? null,
    best?.maxScore ?? null,
    best?.maxScore ? Math.round(((best.score ?? 0) / best.maxScore) * 100) : null,
    best?.submittedAt?.toISOString() ?? null,
    ...questions.map((q) => {
      if (!best) return null;
      const v = lookup.get(`${best.id}:${q.id}`);
      return v === undefined || v === null ? null : v ? t.result.correct : t.result.incorrect;
    }),
  ]);
  await audit(actor, "results.exported", { type: "exam", id: examId, meta: { title: exam.title } });
  return { filename: `results-${examId}.csv`, csv: toCsv([header, ...body]) };
}

export interface AnalyticsFilters {
  examId?: string;
  groupId?: string;
}

export async function getAnalytics(actor: Actor, filters: AnalyticsFilters = {}, now = new Date()) {
  assertMaster(actor);
  const organizationId = actor.organizationId;
  const allExams = await db.exam.findMany({
    where: { organizationId, status: "PUBLISHED", deletedAt: null },
    select: { id: true, title: true, status: true, startsAt: true, endsAt: true, closedAt: true },
    orderBy: { startsAt: "asc" },
  });
  const groups = await db.group.findMany({ where: { organizationId, deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  const exams = filters.examId ? allExams.filter((e) => e.id === filters.examId) : allExams;
  for (const e of exams) await finalizeExpiredForExam(e.id, now);

  const students: StudentMeta[] = await db.user.findMany({
    where: {
      organizationId,
      role: "STUDENT",
      deletedAt: null,
      ...(filters.groupId ? { memberships: { some: { groupId: filters.groupId, group: { organizationId } } } } : {}),
    },
    select: { id: true, fullName: true },
    orderBy: { fullName: "asc" },
  });
  const studentIds = students.map((s) => s.id);
  const metas: ExamMeta[] = [];
  for (const e of exams) {
    const assigned = await assignedStudents(e.id);
    metas.push({
      id: e.id,
      title: e.title,
      startsAt: e.startsAt,
      closed: displayStatus(e, now) === "closed",
      assignedStudentIds: assigned.map((s) => s.id),
    });
  }
  const facts = await loadFacts(exams.map((e) => e.id), studentIds);
  return {
    analytics: computeAnalytics(facts, metas, students),
    exams: allExams.map((e) => ({ id: e.id, title: e.title })),
    groups,
  };
}

/** One student's performance, for the master's student page. */
export async function getStudentReport(actor: Actor, studentId: string, now = new Date()) {
  assertMaster(actor);
  const student = await db.user.findFirst({
    where: { id: studentId, organizationId: actor.organizationId, role: "STUDENT", deletedAt: null },
    select: { id: true, fullName: true },
  });
  if (!student) throw new NotFoundError();
  const { analytics } = await getAnalytics(actor, {}, now);
  const attempts = await db.attempt.findMany({
    where: { studentId, exam: { organizationId: actor.organizationId, deletedAt: null }, status: { not: "IN_PROGRESS" } },
    select: { id: true, number: true, status: true, score: true, maxScore: true, submittedAt: true, exam: { select: { id: true, title: true } } },
    orderBy: { submittedAt: "desc" },
  });
  const cells = analytics.matrix.cells[studentId] ?? {};
  const topics = analytics.topics
    .filter((x) => cells[x.id])
    .map((x) => ({ id: x.id, name: x.name, correct: cells[x.id].correct, total: cells[x.id].total, classAccuracy: x.accuracy }))
    .sort((a, b) => a.correct / a.total - b.correct / b.total);
  return { student, attempts, topics };
}

export async function getOverview(actor: Actor, now = new Date()) {
  assertMaster(actor);
  const organizationId = actor.organizationId;
  const [exams, studentCount, groupCount, questionCount, publishedCount, scores, recent, user] = await Promise.all([
    db.exam.findMany({
      where: { organizationId, deletedAt: null, status: "PUBLISHED" },
      select: { id: true, title: true, status: true, startsAt: true, endsAt: true, closedAt: true },
    }),
    db.user.count({ where: { organizationId, role: "STUDENT", deletedAt: null, isActive: true } }),
    db.group.count({ where: { organizationId, deletedAt: null } }),
    db.question.count({ where: { organizationId, deletedAt: null } }),
    db.exam.count({ where: { organizationId, deletedAt: null, status: "PUBLISHED" } }),
    db.attempt.findMany({
      where: { exam: { organizationId, deletedAt: null }, status: { not: "IN_PROGRESS" }, maxScore: { gt: 0 } },
      select: { score: true, maxScore: true },
    }),
    db.auditLog.findMany({
      where: { organizationId, action: { notIn: ["login.success"] } },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    db.user.findUnique({ where: { id: actor.id }, select: { onboardingDismissedAt: true } }),
  ]);
  const active = exams.filter((e) => displayStatus(e, now) === "active");
  const average = scores.length ? scores.reduce((n, a) => n + (a.score ?? 0) / (a.maxScore ?? 1), 0) / scores.length : null;
  return {
    activeExams: active,
    studentCount,
    questionCount,
    average,
    recent,
    onboarding: user?.onboardingDismissedAt
      ? null
      : { student: studentCount > 0, group: groupCount > 0, question: questionCount > 0, exam: publishedCount > 0 },
  };
}

export async function listAudit(actor: Actor) {
  assertMaster(actor);
  const logs = await db.auditLog.findMany({
    where: { organizationId: actor.organizationId },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const actorIds = [...new Set(logs.flatMap((l) => (l.actorId ? [l.actorId] : [])))];
  const users = await db.user.findMany({ where: { id: { in: actorIds }, organizationId: actor.organizationId }, select: { id: true, fullName: true } });
  const names = new Map(users.map((u) => [u.id, u.fullName]));
  return logs.map((l) => ({ ...l, actorName: l.actorId ? (names.get(l.actorId) ?? "") : "" }));
}
