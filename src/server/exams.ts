import { displayStatus } from "@/lib/exam-rules";
import { t } from "@/lib/i18n";
import { examInput, firstError } from "@/lib/schemas";
import type { Prisma } from "@/generated/prisma/client";
import { audit } from "./audit";
import { assertMaster, type Actor } from "./authz";
import { db } from "./db";
import { AppError, NotFoundError } from "./errors";
import type { QuestionSnapshot } from "./snapshot";

const e = t.exams;

export async function listExams(actor: Actor, now = new Date()) {
  assertMaster(actor);
  const exams = await db.exam.findMany({
    where: { organizationId: actor.organizationId, deletedAt: null },
    select: {
      id: true,
      title: true,
      status: true,
      startsAt: true,
      endsAt: true,
      closedAt: true,
      durationMinutes: true,
      _count: { select: { questions: true, attempts: true } },
    },
    orderBy: { startsAt: "desc" },
  });
  return exams.map((x) => ({ ...x, displayStatus: displayStatus(x, now) }));
}

export async function getExam(actor: Actor, id: string, now = new Date()) {
  assertMaster(actor);
  const exam = await db.exam.findFirst({
    where: { id, organizationId: actor.organizationId, deletedAt: null },
    include: {
      questions: {
        orderBy: { position: "asc" },
        select: { questionId: true, points: true, question: { select: { title: true, type: true } } },
      },
      students: { select: { userId: true } },
      groups: { select: { groupId: true } },
      _count: { select: { attempts: true } },
    },
  });
  if (!exam) throw new NotFoundError();
  return { ...exam, displayStatus: displayStatus(exam, now) };
}

function parseExam(raw: unknown) {
  const parsed = examInput.safeParse(raw);
  if (!parsed.success) throw new AppError(firstError(parsed.error));
  const d = parsed.data;
  if (d.endsAt <= d.startsAt) throw new AppError(e.errors.window);
  if (d.durationMinutes * 60_000 > d.endsAt.getTime() - d.startsAt.getTime()) throw new AppError(e.errors.durationTooLong);
  if (d.reviewPolicy === "AT_TIME" && !d.reviewAt) throw new AppError(e.errors.reviewAt);
  return d;
}

async function assertOwned(organizationId: string, d: ReturnType<typeof parseExam>) {
  const q = new Set(d.questionIds);
  const g = new Set(d.groupIds);
  const s = new Set(d.studentIds);
  const [qCount, gCount, sCount] = await Promise.all([
    db.question.count({ where: { id: { in: [...q] }, organizationId, deletedAt: null } }),
    db.group.count({ where: { id: { in: [...g] }, organizationId, deletedAt: null } }),
    db.user.count({ where: { id: { in: [...s] }, organizationId, role: "STUDENT", deletedAt: null } }),
  ]);
  if (qCount !== q.size || gCount !== g.size || sCount !== s.size) throw new NotFoundError();
}

function examFields(d: ReturnType<typeof parseExam>) {
  return {
    title: d.title,
    description: d.description,
    durationMinutes: d.durationMinutes,
    startsAt: d.startsAt,
    endsAt: d.endsAt,
    maxAttempts: d.maxAttempts,
    shuffleQuestions: d.shuffleQuestions,
    shuffleOptions: d.shuffleOptions,
    reviewPolicy: d.reviewPolicy,
    reviewAt: d.reviewPolicy === "AT_TIME" ? d.reviewAt : null,
  };
}

function relations(d: ReturnType<typeof parseExam>) {
  return {
    questions: [...new Set(d.questionIds)].map((questionId, position) => ({
      questionId,
      position,
      points: d.points[questionId] ?? 1,
    })),
    students: [...new Set(d.studentIds)].map((userId) => ({ userId })),
    groups: [...new Set(d.groupIds)].map((groupId) => ({ groupId })),
  };
}

export async function saveExamDraft(actor: Actor, id: string | null, raw: unknown): Promise<string> {
  assertMaster(actor);
  const d = parseExam(raw);
  await assertOwned(actor.organizationId, d);
  const rel = relations(d);

  if (!id) {
    const exam = await db.exam.create({
      data: {
        ...examFields(d),
        organizationId: actor.organizationId,
        createdById: actor.id,
        questions: { create: rel.questions },
        students: { create: rel.students },
        groups: { create: rel.groups },
      },
    });
    await audit(actor, "exam.created", { type: "exam", id: exam.id, meta: { title: exam.title } });
    return exam.id;
  }

  const existing = await getExam(actor, id);
  if (existing.status !== "DRAFT") throw new AppError(e.errors.notDraft, 409);
  await db.$transaction([
    db.examQuestion.deleteMany({ where: { examId: id } }),
    db.examStudent.deleteMany({ where: { examId: id } }),
    db.examGroup.deleteMany({ where: { examId: id } }),
    db.exam.update({
      where: { id },
      data: {
        ...examFields(d),
        questions: { create: rel.questions },
        students: { create: rel.students },
        groups: { create: rel.groups },
      },
    }),
  ]);
  await audit(actor, "exam.updated", { type: "exam", id, meta: { title: d.title } });
  return id;
}

/** Freezes each question into a snapshot, so later bank edits cannot change a live exam. */
export async function publishExam(actor: Actor, id: string, now = new Date()) {
  assertMaster(actor);
  const exam = await db.exam.findFirst({
    where: { id, organizationId: actor.organizationId, deletedAt: null },
    include: {
      questions: {
        include: { question: { include: { topics: { include: { topic: true } } } } },
      },
      students: { select: { userId: true } },
      groups: { include: { group: { select: { members: { select: { userId: true } } } } } },
    },
  });
  if (!exam) throw new NotFoundError();
  if (exam.status !== "DRAFT") throw new AppError(e.errors.notDraft, 409);
  if (exam.questions.length === 0) throw new AppError(e.errors.noQuestions);
  const assigned = exam.students.length + exam.groups.reduce((n, g) => n + g.group.members.length, 0);
  if (assigned === 0) throw new AppError(e.errors.noStudents);
  if (exam.endsAt <= now) throw new AppError(e.errors.endInPast);

  await db.$transaction([
    ...exam.questions.map((eq) => {
      const q = eq.question;
      const snapshot: QuestionSnapshot = {
        type: q.type,
        title: q.title,
        prompt: q.prompt,
        explanation: q.explanation,
        difficulty: q.difficulty,
        symbol: q.symbol,
        timeframe: q.timeframe,
        anonymize: q.anonymize,
        visibleCandles: q.visibleCandles as never,
        futureCandles: q.futureCandles as never,
        allowedTools: q.allowedTools,
        options: q.options as never,
        answerKey: q.answerKey as never,
        topics: q.topics.map((x) => ({ id: x.topic.id, name: x.topic.name })),
      };
      return db.examQuestion.update({ where: { id: eq.id }, data: { snapshot: snapshot as unknown as Prisma.InputJsonValue } });
    }),
    db.exam.update({ where: { id }, data: { status: "PUBLISHED", publishedAt: now } }),
  ]);
  await audit(actor, "exam.published", { type: "exam", id, meta: { title: exam.title } });
}

export async function closeExam(actor: Actor, id: string, now = new Date()) {
  assertMaster(actor);
  const exam = await getExam(actor, id, now);
  if (exam.status !== "PUBLISHED") throw new AppError(e.errors.notDraft, 409);
  await db.$transaction([
    db.exam.update({ where: { id }, data: { closedAt: now } }),
    db.attempt.updateMany({ where: { examId: id, status: "IN_PROGRESS", deadlineAt: { gt: now } }, data: { deadlineAt: now } }),
  ]);
  await audit(actor, "exam.closed", { type: "exam", id, meta: { title: exam.title } });
}

export async function deleteExam(actor: Actor, id: string) {
  assertMaster(actor);
  const exam = await getExam(actor, id);
  await db.exam.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit(actor, "exam.deleted", { type: "exam", id, meta: { title: exam.title } });
}

/** All students an exam is assigned to, directly or through a group. */
export async function assignedStudents(examId: string) {
  const rows = await db.user.findMany({
    where: {
      role: "STUDENT",
      deletedAt: null,
      OR: [
        { assignments: { some: { examId } } },
        { memberships: { some: { group: { deletedAt: null, exams: { some: { examId } } } } } },
      ],
    },
    select: { id: true, fullName: true, username: true },
    orderBy: { fullName: "asc" },
  });
  return rows;
}
