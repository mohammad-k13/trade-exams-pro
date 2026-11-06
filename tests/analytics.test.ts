import { describe, expect, it } from "vitest";
import { computeAnalytics, type AnswerFact, type ExamMeta } from "@/lib/analytics";

const topicA = { id: "a", name: "اردر بلاک" };
const topicB = { id: "b", name: "روند" };

function fact(over: Partial<AnswerFact>): AnswerFact {
  return {
    examId: "e1",
    examQuestionId: "q1",
    questionId: "q1",
    title: "سؤال یک",
    topics: [topicA],
    studentId: "s1",
    correct: true,
    answered: true,
    choiceId: null,
    choiceText: null,
    timeSpentMs: 1000,
    points: 1,
    maxPoints: 1,
    ...over,
  };
}
const exam = (id: string, day: number, assigned: string[] = [], closed = true): ExamMeta => ({
  id,
  title: id,
  startsAt: new Date(2030, 0, day),
  closed,
  assignedStudentIds: assigned,
});
const students = ["s1", "s2", "s3", "s4"].map((id) => ({ id, fullName: id }));

describe("question statistics", () => {
  it("computes accuracy and average time", () => {
    const a = computeAnalytics(
      [fact({ studentId: "s1", timeSpentMs: 1000 }), fact({ studentId: "s2", correct: false, points: 0, timeSpentMs: 3000 })],
      [exam("e1", 1)],
      students,
    );
    expect(a.questions[0]).toMatchObject({ accuracy: 0.5, avgTimeMs: 2000, total: 2 });
  });
  it("finds the most-chosen wrong option, ignoring correct answers", () => {
    const wrong = (studentId: string, choiceId: string) => fact({ studentId, correct: false, points: 0, choiceId, choiceText: choiceId });
    const a = computeAnalytics(
      [wrong("s1", "x"), wrong("s2", "x"), wrong("s3", "y"), fact({ studentId: "s4", choiceId: "ok", choiceText: "ok" })],
      [exam("e1", 1)],
      students,
    );
    expect(a.questions[0].topWrong).toEqual({ text: "x", count: 2, share: 0.5 });
  });
  it("orders the hardest question first", () => {
    const a = computeAnalytics(
      [fact({ examQuestionId: "easy", title: "easy" }), fact({ examQuestionId: "hard", title: "hard", correct: false, points: 0 })],
      [exam("e1", 1)],
      students,
    );
    expect(a.hardest[0].title).toBe("hard");
  });
});

describe("topics", () => {
  it("counts a question under each of its topics, weakest first", () => {
    const a = computeAnalytics(
      [fact({ topics: [topicA, topicB], correct: false, points: 0 }), fact({ examQuestionId: "q2", topics: [topicB] })],
      [exam("e1", 1)],
      students,
    );
    expect(a.topics.map((t) => [t.name, t.accuracy])).toEqual([[topicA.name, 0], [topicB.name, 0.5]]);
    expect(a.matrix.cells.s1.b).toEqual({ correct: 1, total: 2 });
  });
});

describe("students needing attention", () => {
  it("flags a low average", () => {
    const a = computeAnalytics([fact({ correct: false, points: 0 })], [exam("e1", 1)], students);
    expect(a.attention.map((x) => x.studentId)).toEqual(["s1"]);
  });
  it("flags a drop between the last two exams, even with a good average", () => {
    const a = computeAnalytics(
      [fact({ examId: "e1" }), fact({ examId: "e2", examQuestionId: "q2", points: 0.7, maxPoints: 1 })],
      [exam("e1", 1), exam("e2", 2)],
      [students[0]],
    );
    expect(a.attention[0].reasons).toHaveLength(1);
  });
  it("flags a missed closed exam, but not one still open", () => {
    const closed = computeAnalytics([], [exam("e1", 1, ["s1"], true)], [students[0]]);
    const open = computeAnalytics([], [exam("e1", 1, ["s1"], false)], [students[0]]);
    expect(closed.attention).toHaveLength(1);
    expect(open.attention).toHaveLength(0);
  });
});

describe("trend", () => {
  it("runs oldest to newest regardless of input order", () => {
    const a = computeAnalytics(
      [fact({ examId: "new", points: 1 }), fact({ examId: "old", examQuestionId: "q2", points: 0 })],
      [exam("new", 9), exam("old", 1)],
      [students[0]],
    );
    expect(a.trend.map((t) => [t.examId, t.average])).toEqual([["old", 0], ["new", 1]]);
  });
});

describe("suspect questions", () => {
  // Ten students ranked by a second question, where the strong ones fail the suspect question.
  const facts: AnswerFact[] = [];
  for (let i = 0; i < 10; i++) {
    const strong = i < 5;
    facts.push(fact({ studentId: `s${i}`, examQuestionId: "bulk", title: "bulk", points: strong ? 9 : 1, maxPoints: 10 }));
    facts.push(fact({ studentId: `s${i}`, examQuestionId: "bad", title: "bad", correct: !strong, points: strong ? 0 : 1, maxPoints: 1 }));
  }
  it("flags a question that stronger students get wrong more often", () => {
    const a = computeAnalytics(facts, [exam("e1", 1)], []);
    expect(a.suspect.map((q) => q.title)).toContain("bad");
  });
  it("stays silent on small samples", () => {
    const a = computeAnalytics(facts.slice(0, 8), [exam("e1", 1)], []);
    expect(a.suspect).toEqual([]);
  });
});

describe("insights", () => {
  it("names the weakest topic", () => {
    const a = computeAnalytics(
      [fact({ correct: false, points: 0 }), fact({ studentId: "s2", correct: false, points: 0 })],
      [exam("e1", 1)],
      students,
    );
    expect(a.insights[0]).toContain(topicA.name);
  });
  it("is empty with no data", () => {
    expect(computeAnalytics([], [], []).insights).toEqual([]);
  });
});
