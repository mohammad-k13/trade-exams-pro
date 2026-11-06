import { beforeEach, describe, expect, it } from "vitest";
import { attemptDeadline, canReview, displayStatus, SAVE_GRACE_MS } from "@/lib/exam-rules";
import { getAttemptView, getStudentReview, saveAnswer, startAttempt, studentDashboard, submitAttempt } from "@/server/attempts";
import { db } from "@/server/db";
import { closeExam } from "@/server/exams";
import { getExamResults } from "@/server/results";
import { at, baseQuestion, makeExam, makeInstitute, minutes, resetDb, T0 } from "./helpers";

beforeEach(resetDb);

describe("deadline calculation", () => {
  it("is startedAt + duration when the window allows it", () => {
    expect(attemptDeadline(T0, 30, at(minutes(120)))).toEqual(at(minutes(30)));
  });
  it("is cut to the exam end for a late starter", () => {
    expect(attemptDeadline(at(minutes(100)), 30, at(minutes(120)))).toEqual(at(minutes(120)));
  });
});

describe("exam window", () => {
  it("rejects starting before the window, and after it", async () => {
    const { master, student } = await makeInstitute();
    const exam = await makeExam(master, [student]);
    await expect(startAttempt(student, exam.id, at(-1000))).rejects.toMatchObject({ status: 409 });
    await expect(startAttempt(student, exam.id, at(minutes(121)))).rejects.toMatchObject({ status: 409 });
  });
  it("derives a display status from the times", () => {
    const e = { status: "PUBLISHED" as const, startsAt: T0, endsAt: at(minutes(60)), closedAt: null };
    expect(displayStatus(e, at(-1))).toBe("scheduled");
    expect(displayStatus(e, at(1))).toBe("active");
    expect(displayStatus(e, at(minutes(60)))).toBe("closed");
    expect(displayStatus({ ...e, closedAt: at(1) }, at(2))).toBe("closed");
    expect(displayStatus({ ...e, status: "DRAFT" }, at(1))).toBe("draft");
  });
});

describe("attempt timing", () => {
  it("stores the server deadline, whatever the client does", async () => {
    const { master, student } = await makeInstitute();
    const exam = await makeExam(master, [student]);
    const id = await startAttempt(student, exam.id, T0);
    const attempt = await db.attempt.findUniqueOrThrow({ where: { id } });
    expect(attempt.deadlineAt).toEqual(at(minutes(30)));
  });

  it("resumes the same attempt with the original deadline after a refresh", async () => {
    const { master, student } = await makeInstitute();
    const exam = await makeExam(master, [student]);
    const id = await startAttempt(student, exam.id, T0);
    await saveAnswer(student, id, { examQuestionId: exam.examQuestionIds[0], response: { kind: "option", optionId: "a" } }, at(minutes(1)));
    const again = await startAttempt(student, exam.id, at(minutes(10)));
    expect(again).toBe(id);
    const view = await getAttemptView(student, id, at(minutes(10)));
    expect(view.deadlineAt).toBe(at(minutes(30)).toISOString());
    expect(view.answers[exam.examQuestionIds[0]].response).toMatchObject({ optionId: "a" });
  });

  it("accepts a save inside the network grace period and rejects one after it", async () => {
    const { master, student } = await makeInstitute();
    const exam = await makeExam(master, [student]);
    const id = await startAttempt(student, exam.id, T0);
    const save = (now: Date) =>
      saveAnswer(student, id, { examQuestionId: exam.examQuestionIds[0], response: { kind: "option", optionId: "b" } }, now);
    await expect(save(at(minutes(30) + SAVE_GRACE_MS))).resolves.toBeTruthy();
    await expect(save(at(minutes(30) + SAVE_GRACE_MS + 1))).rejects.toMatchObject({ status: 409 });
  });

  it("does not let a late save change the answer that was graded", async () => {
    const { master, student } = await makeInstitute();
    const exam = await makeExam(master, [student]);
    const id = await startAttempt(student, exam.id, T0);
    await saveAnswer(student, id, { examQuestionId: exam.examQuestionIds[0], response: { kind: "option", optionId: "a" } }, at(1000));
    await expect(
      saveAnswer(student, id, { examQuestionId: exam.examQuestionIds[0], response: { kind: "option", optionId: "b" } }, at(minutes(31))),
    ).rejects.toMatchObject({ status: 409 });
    const attempt = await db.attempt.findUniqueOrThrow({ where: { id } });
    expect(attempt.status).toBe("TIMED_OUT");
    expect(attempt.score).toBe(0);
  });

  it("auto-submits saved drafts on the next read after timeout, with the deadline as submit time", async () => {
    const { master, student } = await makeInstitute();
    const exam = await makeExam(master, [student]);
    const id = await startAttempt(student, exam.id, T0);
    await saveAnswer(student, id, { examQuestionId: exam.examQuestionIds[0], response: { kind: "option", optionId: "b" } }, at(1000));
    const view = await getAttemptView(student, id, at(minutes(40)));
    expect(view.finished).toBe(true);
    const attempt = await db.attempt.findUniqueOrThrow({ where: { id } });
    expect(attempt.status).toBe("TIMED_OUT");
    expect(attempt.submittedAt).toEqual(at(minutes(30)));
    expect(attempt.score).toBe(1);
  });

  it("finalises abandoned attempts when the master opens results", async () => {
    const { master, student } = await makeInstitute();
    const exam = await makeExam(master, [student]);
    const id = await startAttempt(student, exam.id, T0);
    await getExamResults(master, exam.id, at(minutes(60)));
    expect((await db.attempt.findUniqueOrThrow({ where: { id } })).status).toBe("TIMED_OUT");
  });

  it("finalises abandoned attempts when the student opens the dashboard", async () => {
    const { master, student } = await makeInstitute();
    const exam = await makeExam(master, [student]);
    const id = await startAttempt(student, exam.id, T0);
    await studentDashboard(student, at(minutes(60)));
    expect((await db.attempt.findUniqueOrThrow({ where: { id } })).status).toBe("TIMED_OUT");
  });

  it("grades only once when submit and timeout race", async () => {
    const { master, student } = await makeInstitute();
    const exam = await makeExam(master, [student]);
    const id = await startAttempt(student, exam.id, T0);
    await saveAnswer(student, id, { examQuestionId: exam.examQuestionIds[0], response: { kind: "option", optionId: "b" } }, at(1000));
    await Promise.all([submitAttempt(student, id, at(2000)), submitAttempt(student, id, at(2000)), submitAttempt(student, id, at(2000))]);
    const attempt = await db.attempt.findUniqueOrThrow({ where: { id }, include: { answers: true } });
    expect(attempt.score).toBe(1);
    expect(attempt.answers).toHaveLength(1);
    expect(await db.auditLog.count({ where: { action: "attempt.submitted" } })).toBe(1);
  });

  it("rejects saving after a normal submit", async () => {
    const { master, student } = await makeInstitute();
    const exam = await makeExam(master, [student]);
    const id = await startAttempt(student, exam.id, T0);
    await submitAttempt(student, id, at(1000));
    await expect(
      saveAnswer(student, id, { examQuestionId: exam.examQuestionIds[0], response: { kind: "option", optionId: "b" } }, at(2000)),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("cuts running attempts short when the master closes the exam", async () => {
    const { master, student } = await makeInstitute();
    const exam = await makeExam(master, [student]);
    const id = await startAttempt(student, exam.id, T0);
    await closeExam(master, exam.id, at(minutes(5)));
    expect((await getAttemptView(student, id, at(minutes(6)))).finished).toBe(true);
    await expect(startAttempt(student, exam.id, at(minutes(6)))).rejects.toMatchObject({ status: 409 });
  });
});

describe("attempt limits", () => {
  it("refuses more attempts than allowed", async () => {
    const { master, student } = await makeInstitute();
    const exam = await makeExam(master, [student], undefined, { maxAttempts: 2 });
    await submitAttempt(student, await startAttempt(student, exam.id, T0), at(1000));
    await submitAttempt(student, await startAttempt(student, exam.id, at(2000)), at(3000));
    await expect(startAttempt(student, exam.id, at(4000))).rejects.toMatchObject({ status: 409 });
    expect(await db.attempt.count()).toBe(2);
  });

  it("creates one attempt when two tabs start at once", async () => {
    const { master, student } = await makeInstitute();
    const exam = await makeExam(master, [student]);
    const ids = await Promise.all([startAttempt(student, exam.id, T0), startAttempt(student, exam.id, T0), startAttempt(student, exam.id, T0)]);
    expect(new Set(ids).size).toBe(1);
    expect(await db.attempt.count()).toBe(1);
  });
});

describe("review gate", () => {
  const exam = (policy: "NEVER" | "AFTER_SUBMIT" | "AFTER_CLOSE" | "AT_TIME", extra = {}) => ({
    status: "PUBLISHED" as const,
    startsAt: T0,
    endsAt: at(minutes(60)),
    closedAt: null,
    reviewPolicy: policy,
    reviewAt: null,
    maxAttempts: 1,
    ...extra,
  });
  const during = at(minutes(10));
  const after = at(minutes(61));

  it("never opens without a finished attempt", () => {
    expect(canReview(exam("AFTER_SUBMIT"), 0, false, after)).toBe(false);
  });
  it("AFTER_CLOSE opens only after the window ends", () => {
    expect(canReview(exam("AFTER_CLOSE"), 1, false, during)).toBe(false);
    expect(canReview(exam("AFTER_CLOSE"), 1, false, after)).toBe(true);
  });
  it("AFTER_SUBMIT stays locked while attempts remain", () => {
    expect(canReview(exam("AFTER_SUBMIT"), 1, false, during)).toBe(true);
    expect(canReview(exam("AFTER_SUBMIT", { maxAttempts: 2 }), 1, false, during)).toBe(false);
  });
  it("stays locked while another attempt is running", () => {
    expect(canReview(exam("AFTER_SUBMIT", { maxAttempts: 2 }), 1, true, after)).toBe(false);
  });
  it("AT_TIME waits for the configured time", () => {
    const e = exam("AT_TIME", { reviewAt: at(minutes(90)) });
    expect(canReview(e, 1, false, after)).toBe(false);
    expect(canReview(e, 1, false, at(minutes(91)))).toBe(true);
  });
  it("NEVER stays closed", () => {
    expect(canReview(exam("NEVER"), 1, false, at(minutes(9999)))).toBe(false);
  });
  it("is enforced by the service", async () => {
    const { master, student } = await makeInstitute();
    const e = await makeExam(master, [student], [baseQuestion()]);
    const id = await startAttempt(student, e.id, T0);
    await submitAttempt(student, id, at(1000));
    expect((await getStudentReview(student, id, at(2000))).allowed).toBe(false);
    expect((await getStudentReview(student, id, at(minutes(121)))).allowed).toBe(true);
  });
});
