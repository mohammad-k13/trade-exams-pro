import { beforeEach, describe, expect, it } from "vitest";
import { adminOverview, createOrganization } from "@/server/admin";
import { getAttemptView, getStudentReview, saveAnswer, startAttempt, submitAttempt } from "@/server/attempts";
import { acceptInvite, changePassword, createInvite, login, resolveSession, createSession } from "@/server/auth";
import type { Actor } from "@/server/authz";
import { db } from "@/server/db";
import { closeExam, deleteExam, getExam, listExams, publishExam, saveExamDraft } from "@/server/exams";
import { createQuestion, deleteQuestion, duplicateQuestion, getQuestion, listQuestions, updateQuestion } from "@/server/questions";
import { exportExamCsv, getAnalytics, getExamResults, getMasterAttemptReview, getStudentReport, listAudit, csvCell } from "@/server/results";
import { assertSameOrigin } from "@/server/session";
import { createStudent, createStudentInvite, deleteGroup, getStudent, listStudents, resetStudentPassword, saveGroup, setStudentActive, updateStudent } from "@/server/students";
import { at, baseQuestion, makeExam, makeInstitute, makeUser, minutes, resetDb, T0 } from "./helpers";

beforeEach(resetDb);

async function twoInstitutes() {
  const a = await makeInstitute();
  const b = await makeInstitute();
  const examB = await makeExam(b.master, [b.student]);
  return { a, b, examB };
}

describe("a master cannot touch another institute", () => {
  it("students", async () => {
    const { a, b } = await twoInstitutes();
    const m = a.master;
    const sid = b.student.id;
    for (const call of [
      () => getStudent(m, sid),
      () => updateStudent(m, sid, { fullName: "x", username: "hacked", phone: "", groupIds: [] }),
      () => setStudentActive(m, sid, false),
      () => resetStudentPassword(m, sid),
      () => createStudentInvite(m, sid),
      () => getStudentReport(m, sid),
    ]) {
      await expect(call()).rejects.toMatchObject({ status: 404 });
    }
    expect((await listStudents(m)).map((s) => s.id)).not.toContain(sid);
    expect((await db.user.findUniqueOrThrow({ where: { id: sid } })).isActive).toBe(true);
  });

  it("questions", async () => {
    const { a, examB } = await twoInstitutes();
    const qid = examB.questionIds[0];
    for (const call of [
      () => getQuestion(a.master, qid),
      () => updateQuestion(a.master, qid, baseQuestion()),
      () => duplicateQuestion(a.master, qid),
      () => deleteQuestion(a.master, qid),
    ]) {
      await expect(call()).rejects.toMatchObject({ status: 404 });
    }
    expect(await listQuestions(a.master)).toEqual([]);
  });

  it("exams and results", async () => {
    const { a, examB } = await twoInstitutes();
    for (const call of [
      () => getExam(a.master, examB.id),
      () => publishExam(a.master, examB.id),
      () => closeExam(a.master, examB.id),
      () => deleteExam(a.master, examB.id),
      () => getExamResults(a.master, examB.id),
      () => exportExamCsv(a.master, examB.id),
    ]) {
      await expect(call()).rejects.toMatchObject({ status: 404 });
    }
    expect(await listExams(a.master)).toEqual([]);
  });

  it("attempts", async () => {
    const { a, b, examB } = await twoInstitutes();
    const id = await startAttempt(b.student, examB.id, T0);
    await expect(getMasterAttemptReview(a.master, id)).rejects.toMatchObject({ status: 404 });
  });

  it("groups", async () => {
    const { a, b } = await twoInstitutes();
    const gid = await saveGroup(b.master, null, "B", []);
    await expect(deleteGroup(a.master, gid)).rejects.toMatchObject({ status: 404 });
    await expect(saveGroup(a.master, gid, "x", [])).rejects.toMatchObject({ status: 404 });
  });

  it("cannot pull another institute's resources into its own", async () => {
    const { a, b, examB } = await twoInstitutes();
    await expect(saveGroup(a.master, null, "grab", [b.student.id])).rejects.toMatchObject({ status: 404 });
    const gid = await saveGroup(b.master, null, "B", []);
    await expect(createStudent(a.master, { fullName: "n", username: "newone", phone: "", groupIds: [gid] })).rejects.toMatchObject({ status: 404 });
    const draft = {
      title: "t", durationMinutes: 10, startsAt: T0, endsAt: at(minutes(60)), maxAttempts: 1,
      shuffleQuestions: false, shuffleOptions: false, reviewPolicy: "AFTER_CLOSE", groupIds: [], studentIds: [],
    };
    await expect(saveExamDraft(a.master, null, { ...draft, questionIds: [examB.questionIds[0]] })).rejects.toMatchObject({ status: 404 });
    await expect(saveExamDraft(a.master, null, { ...draft, questionIds: [], studentIds: [b.student.id] })).rejects.toMatchObject({ status: 404 });
    await expect(saveExamDraft(a.master, null, { ...draft, questionIds: [], groupIds: [gid] })).rejects.toMatchObject({ status: 404 });
  });

  it("does not see another institute's audit log or analytics", async () => {
    const { a } = await twoInstitutes();
    expect(await listAudit(a.master)).toEqual([]);
    const { analytics, exams } = await getAnalytics(a.master);
    expect(exams).toEqual([]);
    expect(analytics.answerCount).toBe(0);
  });
});

describe("role boundaries", () => {
  it("a student cannot call master or admin services", async () => {
    const { a, b } = await twoInstitutes();
    const s = a.student;
    for (const call of [
      () => listStudents(s),
      () => createStudent(s, {}),
      () => createQuestion(s, baseQuestion()),
      () => listExams(s),
      () => getAnalytics(s),
      () => listAudit(s),
      () => getStudent(s, b.student.id),
      () => adminOverview(s),
      () => createOrganization(s, {}),
    ]) {
      await expect(call()).rejects.toMatchObject({ status: 403 });
    }
  });

  it("a master cannot use student or admin services", async () => {
    const { a, examB } = await twoInstitutes();
    await expect(startAttempt(a.master, examB.id, T0)).rejects.toMatchObject({ status: 403 });
    await expect(adminOverview(a.master)).rejects.toMatchObject({ status: 403 });
  });

  it("an admin cannot use master services", async () => {
    const admin: Actor = { id: "x", role: "ADMIN", organizationId: null };
    await expect(listStudents(admin)).rejects.toMatchObject({ status: 403 });
  });
});

describe("students see only their own work", () => {
  it("cannot start an exam that was not assigned to them", async () => {
    const { master, student } = await makeInstitute();
    const other = await makeUser("STUDENT", student.organizationId!);
    const exam = await makeExam(master, [student]);
    await expect(startAttempt(other, exam.id, T0)).rejects.toMatchObject({ status: 404 });
  });

  it("cannot start an exam from another institute", async () => {
    const { a, examB } = await twoInstitutes();
    await expect(startAttempt(a.student, examB.id, T0)).rejects.toMatchObject({ status: 404 });
  });

  it("gets the exam through a group, and loses it when the group is deleted", async () => {
    const { master, student } = await makeInstitute();
    const gid = await saveGroup(master, null, "کلاس", [student.id]);
    const exam = await makeExam(master, [], undefined, { groupIds: [gid] });
    expect(await startAttempt(student, exam.id, T0)).toBeTruthy();
    const other = await makeUser("STUDENT", student.organizationId!);
    await saveGroup(master, gid, "کلاس", [other.id]);
    await deleteGroup(master, gid);
    await expect(startAttempt(other, exam.id, T0)).rejects.toMatchObject({ status: 404 });
  });

  it("cannot read or change someone else's attempt", async () => {
    const { master, student } = await makeInstitute();
    const other = await makeUser("STUDENT", student.organizationId!);
    const exam = await makeExam(master, [student, other]);
    const id = await startAttempt(student, exam.id, T0);
    for (const call of [
      () => getAttemptView(other, id, at(1000)),
      () => getStudentReview(other, id, at(1000)),
      () => saveAnswer(other, id, { examQuestionId: exam.examQuestionIds[0], response: { kind: "option", optionId: "a" } }, at(1000)),
      () => submitAttempt(other, id, at(1000)),
    ]) {
      await expect(call()).rejects.toMatchObject({ status: 404 });
    }
  });

  it("cannot see draft exams", async () => {
    const { master, student } = await makeInstitute();
    const qid = await createQuestion(master, baseQuestion());
    const id = await saveExamDraft(master, null, {
      title: "d", durationMinutes: 10, startsAt: T0, endsAt: at(minutes(60)), maxAttempts: 1,
      shuffleQuestions: false, shuffleOptions: false, reviewPolicy: "AFTER_CLOSE",
      questionIds: [qid], groupIds: [], studentIds: [student.id],
    });
    await expect(startAttempt(student, id, at(1000))).rejects.toMatchObject({ status: 404 });
  });
});

describe("authentication", () => {
  async function user() {
    const org = await db.organization.create({ data: { name: "o" } });
    return makeUser("STUDENT", org.id, { username: "ali" });
  }

  it("logs in with the right password and rejects the wrong one with one message", async () => {
    await user();
    const ok = await login("ali", "password123", "1.1.1.1");
    expect(ok.user.username).toBe("ali");
    await expect(login("ali", "nope", "1.1.1.1")).rejects.toMatchObject({ status: 401 });
    await expect(login("ghost", "nope", "1.1.1.1")).rejects.toMatchObject({ status: 401 });
  });

  it("locks an identifier after repeated failures, even with the right password", async () => {
    await user();
    for (let i = 0; i < 5; i++) await expect(login("ali", "bad", "1.1.1.1")).rejects.toMatchObject({ status: 401 });
    await expect(login("ali", "password123", "1.1.1.1")).rejects.toMatchObject({ status: 429 });
  });

  it("unlocks after the window passes", async () => {
    await user();
    const t = new Date();
    for (let i = 0; i < 5; i++) await expect(login("ali", "bad", "1.1.1.1", t)).rejects.toBeTruthy();
    await expect(login("ali", "password123", "1.1.1.1", new Date(t.getTime() + 16 * 60_000))).resolves.toBeTruthy();
  });

  it("stores only hashed sessions and rejects expired ones", async () => {
    const u = await user();
    const { token } = await createSession(u.id, T0);
    expect(await db.session.count({ where: { id: token } })).toBe(0);
    expect(await resolveSession(token, at(1000))).toMatchObject({ id: u.id });
    expect(await resolveSession(token, at(minutes(60 * 24 * 15)))).toBeNull();
    expect(await resolveSession("forged", at(1000))).toBeNull();
  });

  it("kills sessions and blocks login when a student is deactivated", async () => {
    const { master, student } = await makeInstitute();
    const { token } = await createSession(student.id);
    await setStudentActive(master, student.id, false);
    expect(await resolveSession(token)).toBeNull();
    const s = await db.user.findUniqueOrThrow({ where: { id: student.id } });
    await expect(login(s.username, "password123", "1.1.1.1")).rejects.toMatchObject({ status: 401 });
  });

  it("forces a password change after a reset, and logs other sessions out", async () => {
    const { master, student } = await makeInstitute();
    const { token } = await createSession(student.id);
    const temp = await resetStudentPassword(master, student.id);
    expect(await resolveSession(token)).toBeNull();
    const s = await db.user.findUniqueOrThrow({ where: { id: student.id } });
    expect(s.mustChangePassword).toBe(true);
    const { session } = await login(s.username, temp, "1.1.1.1");
    expect(await resolveSession(session.token)).toMatchObject({ mustChangePassword: true });
    await changePassword(student, temp, "a-new-password");
    expect((await db.user.findUniqueOrThrow({ where: { id: student.id } })).mustChangePassword).toBe(false);
  });

  it("requires the current password to change it", async () => {
    const u = await user();
    await expect(changePassword(u, "wrong", "a-new-password")).rejects.toBeTruthy();
    await expect(changePassword(u, "password123", "short")).rejects.toBeTruthy();
  });

  it("uses an invite only once, and rejects expired or superseded ones", async () => {
    const u = await user();
    const first = await createInvite(u.id, T0);
    const token = await createInvite(u.id, T0);
    await expect(acceptInvite(first, "a-new-password", at(1000))).rejects.toMatchObject({ status: 410 });
    await expect(acceptInvite(token, "a-new-password", at(minutes(60 * 24 * 8)))).rejects.toMatchObject({ status: 410 });
    await acceptInvite(token, "a-new-password", at(1000));
    await expect(acceptInvite(token, "another-password", at(2000))).rejects.toMatchObject({ status: 410 });
  });

  it("rejects cross-origin requests to route handlers", () => {
    const req = (origin: string | null) =>
      new Request("http://localhost/api", { method: "POST", headers: { host: "app.test", ...(origin ? { origin } : {}) } });
    expect(() => assertSameOrigin(req("https://app.test"))).not.toThrow();
    expect(() => assertSameOrigin(req("https://evil.test"))).toThrow();
    expect(() => assertSameOrigin(req(null))).toThrow();
  });
});

describe("CSV export safety", () => {
  it("neutralises spreadsheet formulas in student-controlled text", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("@cmd")).toBe("'@cmd");
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell(-5)).toBe("-5");
  });
});
