// Pure weak-spot calculations over answer facts. No I/O.
import { formatNumber, formatPercent, toFaDigits } from "./format";
import { t } from "./i18n";

export interface AnswerFact {
  examId: string;
  examQuestionId: string;
  questionId: string;
  title: string;
  topics: { id: string; name: string }[];
  studentId: string;
  correct: boolean;
  answered: boolean;
  /** The chosen option or direction, when the question has discrete choices. */
  choiceId: string | null;
  choiceText: string | null;
  timeSpentMs: number;
  points: number;
  maxPoints: number;
}

export interface ExamMeta {
  id: string;
  title: string;
  startsAt: Date;
  closed: boolean;
  assignedStudentIds: string[];
}

export interface StudentMeta {
  id: string;
  fullName: string;
}

export interface QuestionStat {
  examQuestionId: string;
  examId: string;
  title: string;
  total: number;
  correct: number;
  accuracy: number;
  avgTimeMs: number;
  topWrong: { text: string; count: number; share: number } | null;
  discrimination: number | null;
}

export interface TopicRow {
  id: string;
  name: string;
  total: number;
  correct: number;
  accuracy: number;
}

export interface AttentionRow {
  studentId: string;
  fullName: string;
  average: number | null;
  reasons: string[];
}

export interface TrendPoint {
  examId: string;
  title: string;
  average: number;
  participants: number;
}

export interface Analytics {
  answerCount: number;
  questions: QuestionStat[];
  hardest: QuestionStat[];
  wrongOptions: (QuestionStat & { topWrong: NonNullable<QuestionStat["topWrong"]> })[];
  topics: TopicRow[];
  /** studentId -> topicId -> accuracy. */
  matrix: { students: StudentMeta[]; topics: TopicRow[]; cells: Record<string, Record<string, { correct: number; total: number }>> };
  attention: AttentionRow[];
  trend: TrendPoint[];
  suspect: QuestionStat[];
  insights: string[];
}

export const LOW_AVERAGE = 0.5;
export const DECLINE_POINTS = 0.15;
/** Below this many students, item statistics are noise. */
export const MIN_FOR_DISCRIMINATION = 8;

const ratio = (a: number, b: number) => (b === 0 ? 0 : a / b);

/**
 * Upper-lower discrimination index: accuracy of the top 27% of students minus the bottom 27%, ranked
 * by exam score. Negative means stronger students did worse, which usually means a bad key or wording.
 */
function discriminationFor(facts: AnswerFact[], examScores: Map<string, number>): number | null {
  if (facts.length < MIN_FOR_DISCRIMINATION) return null;
  const ranked = [...facts].sort((a, b) => (examScores.get(b.studentId) ?? 0) - (examScores.get(a.studentId) ?? 0));
  const n = Math.max(2, Math.round(ranked.length * 0.27));
  const share = (list: AnswerFact[]) => ratio(list.filter((f) => f.correct).length, list.length);
  return share(ranked.slice(0, n)) - share(ranked.slice(-n));
}

export function computeAnalytics(facts: AnswerFact[], exams: ExamMeta[], students: StudentMeta[]): Analytics {
  // Exam score per student, needed for discrimination and trend.
  const examStudent = new Map<string, Map<string, { got: number; max: number }>>();
  for (const f of facts) {
    const byStudent = examStudent.get(f.examId) ?? new Map();
    const row = byStudent.get(f.studentId) ?? { got: 0, max: 0 };
    row.got += f.points;
    row.max += f.maxPoints;
    byStudent.set(f.studentId, row);
    examStudent.set(f.examId, byStudent);
  }

  const byQuestion = new Map<string, AnswerFact[]>();
  for (const f of facts) byQuestion.set(f.examQuestionId, [...(byQuestion.get(f.examQuestionId) ?? []), f]);

  const questions: QuestionStat[] = [...byQuestion.values()].map((list) => {
    const first = list[0];
    const correct = list.filter((f) => f.correct).length;
    const wrong = new Map<string, { text: string; count: number }>();
    for (const f of list) {
      if (!f.correct && f.choiceId && f.choiceText) {
        const w = wrong.get(f.choiceId) ?? { text: f.choiceText, count: 0 };
        w.count++;
        wrong.set(f.choiceId, w);
      }
    }
    const top = [...wrong.values()].sort((a, b) => b.count - a.count)[0];
    const scores = new Map(
      [...(examStudent.get(first.examId) ?? new Map())].map(([id, r]) => [id, ratio(r.got, r.max)]),
    );
    return {
      examQuestionId: first.examQuestionId,
      examId: first.examId,
      title: first.title,
      total: list.length,
      correct,
      accuracy: ratio(correct, list.length),
      avgTimeMs: list.reduce((n, f) => n + f.timeSpentMs, 0) / list.length,
      topWrong: top ? { text: top.text, count: top.count, share: top.count / list.length } : null,
      discrimination: discriminationFor(list, scores),
    };
  });

  const hardest = [...questions].sort((a, b) => a.accuracy - b.accuracy || b.total - a.total).slice(0, 5);
  const wrongOptions = questions
    .filter((q): q is QuestionStat & { topWrong: NonNullable<QuestionStat["topWrong"]> } => !!q.topWrong)
    .sort((a, b) => b.topWrong.share - a.topWrong.share)
    .slice(0, 5);
  const suspect = questions.filter((q) => q.discrimination !== null && q.discrimination < 0);

  // Topics, for the class and for each student.
  const topicMap = new Map<string, TopicRow>();
  const cells: Analytics["matrix"]["cells"] = {};
  for (const f of facts) {
    for (const topic of f.topics) {
      const row = topicMap.get(topic.id) ?? { id: topic.id, name: topic.name, total: 0, correct: 0, accuracy: 0 };
      row.total++;
      if (f.correct) row.correct++;
      row.accuracy = row.correct / row.total;
      topicMap.set(topic.id, row);
      const cell = ((cells[f.studentId] ??= {})[topic.id] ??= { correct: 0, total: 0 });
      cell.total++;
      if (f.correct) cell.correct++;
    }
  }
  const topics = [...topicMap.values()].sort((a, b) => a.accuracy - b.accuracy);

  // Trend across exams, oldest first.
  const ordered = [...exams].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const trend: TrendPoint[] = ordered.flatMap((exam) => {
    const byStudent = examStudent.get(exam.id);
    if (!byStudent?.size) return [];
    const scores = [...byStudent.values()].map((r) => ratio(r.got, r.max));
    return [{ examId: exam.id, title: exam.title, average: scores.reduce((a, b) => a + b, 0) / scores.length, participants: scores.length }];
  });

  // Students needing attention.
  const attention: AttentionRow[] = [];
  for (const student of students) {
    const scores = ordered.flatMap((exam) => {
      const r = examStudent.get(exam.id)?.get(student.id);
      return r ? [ratio(r.got, r.max)] : [];
    });
    const missed = ordered.filter(
      (exam) => exam.closed && exam.assignedStudentIds.includes(student.id) && !examStudent.get(exam.id)?.has(student.id),
    ).length;
    const average = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
    const reasons: string[] = [];
    if (average !== null && average < LOW_AVERAGE) reasons.push(t.analytics.reason.low(formatPercent(average)));
    if (scores.length >= 2) {
      const drop = scores[scores.length - 2] - scores[scores.length - 1];
      if (drop >= DECLINE_POINTS) reasons.push(t.analytics.reason.declining(formatPercent(drop)));
    }
    if (missed > 0) reasons.push(t.analytics.reason.missed(toFaDigits(missed)));
    if (reasons.length) attention.push({ studentId: student.id, fullName: student.fullName, average, reasons });
  }
  attention.sort((a, b) => (a.average ?? 0) - (b.average ?? 0));

  // Plain-language insights, most useful first.
  const i = t.analytics.insight;
  const insights: string[] = [];
  const meaningfulTopics = topics.filter((x) => x.total >= 2);
  if (meaningfulTopics.length) {
    const weak = meaningfulTopics[0];
    insights.push(i.weakestTopic(weak.name, formatPercent(weak.accuracy)));
  }
  if (meaningfulTopics.length > 1) {
    const strong = meaningfulTopics[meaningfulTopics.length - 1];
    if (strong.accuracy > meaningfulTopics[0].accuracy) insights.push(i.strongestTopic(strong.name, formatPercent(strong.accuracy)));
  }
  if (hardest[0]) insights.push(i.hardest(hardest[0].title, formatPercent(hardest[0].accuracy)));
  if (wrongOptions[0] && wrongOptions[0].topWrong.share >= 0.25) {
    insights.push(i.wrongOption(wrongOptions[0].title, wrongOptions[0].topWrong.text, formatPercent(wrongOptions[0].topWrong.share)));
  }
  if (attention.length) insights.push(i.attention(toFaDigits(attention.length)));
  if (trend.length >= 2) {
    const delta = trend[trend.length - 1].average - trend[trend.length - 2].average;
    if (Math.abs(delta) >= 0.01) {
      const pct = formatNumber(Math.abs(delta) * 100, 0);
      insights.push(delta > 0 ? i.trendUp(pct) : i.trendDown(pct));
    }
  }
  if (suspect[0]) insights.push(i.suspect(suspect[0].title));

  const withData = students.filter((st) => cells[st.id]);
  return {
    answerCount: facts.length,
    questions,
    hardest,
    wrongOptions,
    topics,
    matrix: { students: withData, topics, cells },
    attention,
    trend,
    suspect,
    insights,
  };
}
