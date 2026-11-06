import { beforeEach, describe, expect, it } from "vitest";
import { examLanding, getAttemptView, getStudentReview, saveAnswer, startAttempt, studentDashboard, submitAttempt } from "@/server/attempts";
import { db } from "@/server/db";
import { at, baseQuestion, FUTURE_SENTINEL_PRICE, LEVEL_SENTINEL, makeExam, makeInstitute, minutes, REAL_START, resetDb, T0 } from "./helpers";

beforeEach(resetDb);

/** Everything that must stay secret, in the form it would take if serialised. */
const SECRETS = [
  String(FUTURE_SENTINEL_PRICE),
  String(LEVEL_SENTINEL),
  "SECRET_EXPLANATION",
  "SECRETUSDT",
  "answerKey",
  "correctOptionId",
  "futureCandles",
  "isCorrect",
  "gradingDetail",
  "explanation",
];

function expectNoSecrets(payload: unknown) {
  const json = JSON.stringify(payload);
  for (const secret of SECRETS) expect(json, `leaked "${secret}"`).not.toContain(secret);
}

const allTypes = () => [
  baseQuestion(),
  baseQuestion({ type: "DIRECTION", horizon: 5, sidewaysPct: 1, options: [], correctOptionId: null }),
  baseQuestion({ type: "DRAW_LEVEL", level: LEVEL_SENTINEL, tolerancePct: 1, options: [], correctOptionId: null }),
];

describe("before the attempt is finished", () => {
  it("the attempt view has no answers, future candles, explanation or real symbol", async () => {
    const { master, student } = await makeInstitute();
    const exam = await makeExam(master, [student], allTypes());
    const id = await startAttempt(student, exam.id, T0);
    const view = await getAttemptView(student, id, at(1000));
    expect(view.questions).toHaveLength(3);
    expectNoSecrets(view);
  });

  it("sends exactly the visible candles", async () => {
    const { master, student } = await makeInstitute();
    const exam = await makeExam(master, [student]);
    const view = await getAttemptView(student, await startAttempt(student, exam.id, T0), at(1000));
    expect(view.questions[0].candles).toHaveLength(40);
  });

  it("the dashboard and instructions carry no secrets", async () => {
    const { master, student } = await makeInstitute();
    const exam = await makeExam(master, [student], allTypes());
    expectNoSecrets(await studentDashboard(student, T0));
    expectNoSecrets(await examLanding(student, exam.id, T0));
  });

  it("the autosave response carries no secrets", async () => {
    const { master, student } = await makeInstitute();
    const exam = await makeExam(master, [student], allTypes());
    const id = await startAttempt(student, exam.id, T0);
    const res = await saveAnswer(student, id, { examQuestionId: exam.examQuestionIds[0], response: { kind: "option", optionId: "a" } }, at(1000));
    expectNoSecrets(res);
  });

  it("hides real dates on anonymised questions", async () => {
    const { master, student } = await makeInstitute();
    const exam = await makeExam(master, [student]);
    const view = await getAttemptView(student, await startAttempt(student, exam.id, T0), at(1000));
    const q = view.questions[0];
    expect(q.symbol).toBeNull();
    expect(q.candles[0].timestamp).not.toBe(REAL_START);
    expect(JSON.stringify(q)).not.toContain(String(REAL_START));
  });

  it("shows symbol and dates when the master turned anonymising off", async () => {
    const { master, student } = await makeInstitute();
    const exam = await makeExam(master, [student], [baseQuestion({ anonymize: false, symbol: "BTCUSDT" })]);
    const q = (await getAttemptView(student, await startAttempt(student, exam.id, T0), at(1000))).questions[0];
    expect(q.symbol).toBe("BTCUSDT");
    expect(q.candles[0].timestamp).toBe(REAL_START);
  });
});

describe("after submitting, before review opens", () => {
  it("the review endpoint returns the reason and nothing else", async () => {
    const { master, student } = await makeInstitute();
    const exam = await makeExam(master, [student], allTypes());
    const id = await startAttempt(student, exam.id, T0);
    await submitAttempt(student, id, at(1000));
    const review = await getStudentReview(student, id, at(2000));
    expect(review.allowed).toBe(false);
    expectNoSecrets(review);
  });

  it("does not expose the score while the exam is running", async () => {
    const { master, student } = await makeInstitute();
    const exam = await makeExam(master, [student]);
    const id = await startAttempt(student, exam.id, T0);
    await saveAnswer(student, id, { examQuestionId: exam.examQuestionIds[0], response: { kind: "option", optionId: "b" } }, at(500));
    await submitAttempt(student, id, at(1000));
    const review = await getStudentReview(student, id, at(2000));
    expect(review.allowed === false && review.score).toBeNull();
    const dash = await studentDashboard(student, at(2000));
    expect(dash[0].score).toBeNull();
  });

  it("the finished attempt view has no question data", async () => {
    const { master, student } = await makeInstitute();
    const exam = await makeExam(master, [student], allTypes());
    const id = await startAttempt(student, exam.id, T0);
    await submitAttempt(student, id, at(1000));
    const view = await getAttemptView(student, id, at(2000));
    expect(view.questions).toEqual([]);
  });

  it("with NEVER, the score appears after close but answers never do", async () => {
    const { master, student } = await makeInstitute();
    const exam = await makeExam(master, [student], allTypes(), { reviewPolicy: "NEVER" });
    const id = await startAttempt(student, exam.id, T0);
    await submitAttempt(student, id, at(1000));
    const review = await getStudentReview(student, id, at(minutes(500)));
    expect(review.allowed).toBe(false);
    expect(review.allowed === false && review.score).toMatchObject({ maxScore: 3 });
    expectNoSecrets(review);
  });
});

describe("once review opens", () => {
  it("reveals future candles, explanation and real symbol, with dates restored", async () => {
    const { master, student } = await makeInstitute();
    const exam = await makeExam(master, [student]);
    const id = await startAttempt(student, exam.id, T0);
    await submitAttempt(student, id, at(1000));
    const review = await getStudentReview(student, id, at(minutes(121)));
    if (!review.allowed) throw new Error("expected review");
    const q = review.questions[0];
    expect(q.futureCandles).toHaveLength(10);
    expect(q.explanation).toBe("SECRET_EXPLANATION");
    expect(q.symbol).toBe("SECRETUSDT");
    expect(q.visibleCandles[0].timestamp).toBe(REAL_START);
  });
});

describe("the client cannot influence the grade", () => {
  it("ignores isCorrect, score and points sent with an answer", async () => {
    const { master, student } = await makeInstitute();
    const exam = await makeExam(master, [student]);
    const id = await startAttempt(student, exam.id, T0);
    await saveAnswer(
      student,
      id,
      {
        examQuestionId: exam.examQuestionIds[0],
        response: { kind: "option", optionId: "a", isCorrect: true },
        isCorrect: true,
        points: 100,
        score: 100,
      },
      at(500),
    );
    const stored = await db.answer.findFirstOrThrow({ where: { attemptId: id } });
    expect(stored.isCorrect).toBeNull();
    expect(JSON.stringify(stored.response)).not.toContain("isCorrect");
    await submitAttempt(student, id, at(1000));
    expect((await db.attempt.findUniqueOrThrow({ where: { id } })).score).toBe(0);
  });

  it("rejects an option that does not exist", async () => {
    const { master, student } = await makeInstitute();
    const exam = await makeExam(master, [student]);
    const id = await startAttempt(student, exam.id, T0);
    await expect(
      saveAnswer(student, id, { examQuestionId: exam.examQuestionIds[0], response: { kind: "option", optionId: "zzz" } }, at(500)),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("drops drawings made with tools the question does not allow", async () => {
    const { master, student } = await makeInstitute();
    const exam = await makeExam(master, [student], [
      baseQuestion({ type: "DRAW_LEVEL", level: 100, tolerancePct: 1, allowedTools: ["horizontalStraightLine"], options: [], correctOptionId: null }),
    ]);
    const id = await startAttempt(student, exam.id, T0);
    await saveAnswer(student, id, {
      examQuestionId: exam.examQuestionIds[0],
      response: { kind: "draw", drawings: [{ tool: "priceLine", points: [{ index: 1, price: 100 }] }] },
    }, at(500));
    await submitAttempt(student, id, at(1000));
    expect((await db.attempt.findUniqueOrThrow({ where: { id } })).score).toBe(0);
  });

  it("freezes questions at publish, so bank edits do not change a live exam", async () => {
    const { master, student } = await makeInstitute();
    const exam = await makeExam(master, [student]);
    await db.question.update({ where: { id: exam.questionIds[0] }, data: { prompt: "changed", answerKey: { type: "MULTIPLE_CHOICE", correctOptionId: "a" } } });
    const id = await startAttempt(student, exam.id, T0);
    const view = await getAttemptView(student, id, at(100));
    expect(view.questions[0].prompt).toBe("متن سؤال");
    await saveAnswer(student, id, { examQuestionId: exam.examQuestionIds[0], response: { kind: "option", optionId: "b" } }, at(200));
    await submitAttempt(student, id, at(300));
    expect((await db.attempt.findUniqueOrThrow({ where: { id } })).score).toBe(1);
  });
});
