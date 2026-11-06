"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parseCandlesCsv } from "@/lib/candles";
import { t } from "@/lib/i18n";
import { run } from "@/server/action";
import { db } from "@/server/db";
import { AppError } from "@/server/errors";
import { closeExam, deleteExam, publishExam, saveExamDraft } from "@/server/exams";
import { createQuestion, deleteQuestion, duplicateQuestion, fetchBinanceCandles, updateQuestion } from "@/server/questions";
import { requireMaster } from "@/server/session";
import {
  createStudent,
  createStudentInvite,
  deleteGroup,
  importStudents,
  resetStudentPassword,
  saveGroup,
  setStudentActive,
  updateStudent,
} from "@/server/students";

const appUrl = () => process.env.APP_URL?.replace(/\/$/, "") ?? "";

// --- Students ---

export async function createStudentAction(input: unknown) {
  return run(async () => {
    const r = await createStudent(await requireMaster(), input);
    revalidatePath("/master/students");
    return r;
  });
}

export async function updateStudentAction(id: string, input: unknown) {
  return run(async () => {
    await updateStudent(await requireMaster(), id, input);
    revalidatePath("/master/students");
    revalidatePath(`/master/students/${id}`);
    return null;
  });
}

export async function setStudentActiveAction(id: string, active: boolean) {
  return run(async () => {
    await setStudentActive(await requireMaster(), id, active);
    revalidatePath(`/master/students/${id}`);
    revalidatePath("/master/students");
    return null;
  });
}

export async function resetPasswordAction(id: string) {
  return run(async () => resetStudentPassword(await requireMaster(), id));
}

export async function inviteAction(id: string) {
  return run(async () => `${appUrl()}/invite/${await createStudentInvite(await requireMaster(), id)}`);
}

export async function importStudentsAction(csv: string) {
  return run(async () => {
    const r = await importStudents(await requireMaster(), csv);
    revalidatePath("/master/students");
    return r;
  });
}

// --- Groups ---

export async function saveGroupAction(id: string | null, name: string, memberIds: string[]) {
  return run(async () => {
    const r = await saveGroup(await requireMaster(), id, name, memberIds);
    revalidatePath("/master/groups");
    return r;
  });
}

export async function deleteGroupAction(id: string) {
  return run(async () => {
    await deleteGroup(await requireMaster(), id);
    revalidatePath("/master/groups");
    return null;
  });
}

// --- Questions ---

export async function loadBinanceAction(input: { symbol: string; timeframe: string; from: number; to: number }) {
  return run(async () => fetchBinanceCandles(await requireMaster(), input));
}

export async function parseCsvAction(text: string) {
  return run(async () => {
    await requireMaster();
    const r = parseCandlesCsv(text);
    if (r.ok) return r.candles;
    const q = t.questions;
    throw new AppError(r.error === "empty" ? q.csvEmpty : r.error === "columns" ? q.csvColumns : q.csvRow(r.row ?? 0));
  });
}

export async function saveQuestionAction(id: string | null, input: unknown) {
  const result = await run(async () => {
    const master = await requireMaster();
    if (id) await updateQuestion(master, id, input);
    else await createQuestion(master, input);
    revalidatePath("/master/questions");
    return null;
  });
  if (result.error !== undefined) return result;
  redirect("/master/questions");
}

export async function duplicateQuestionAction(id: string) {
  return run(async () => {
    await duplicateQuestion(await requireMaster(), id);
    revalidatePath("/master/questions");
    return null;
  });
}

export async function deleteQuestionAction(id: string) {
  return run(async () => {
    await deleteQuestion(await requireMaster(), id);
    revalidatePath("/master/questions");
    return null;
  });
}

// --- Exams ---

export async function saveExamAction(id: string | null, input: unknown, publish: boolean) {
  const result = await run(async () => {
    const master = await requireMaster();
    const examId = await saveExamDraft(master, id, input);
    if (publish) await publishExam(master, examId);
    revalidatePath("/master/exams");
    return examId;
  });
  if (result.error !== undefined) return result;
  redirect(`/master/exams/${result.data}`);
}

export async function closeExamAction(id: string) {
  return run(async () => {
    await closeExam(await requireMaster(), id);
    revalidatePath(`/master/exams/${id}`);
    revalidatePath("/master/exams");
    return null;
  });
}

export async function deleteExamAction(id: string) {
  const result = await run(async () => {
    await deleteExam(await requireMaster(), id);
    revalidatePath("/master/exams");
    return null;
  });
  if (result.error !== undefined) return result;
  redirect("/master/exams");
}

// --- Onboarding ---

export async function dismissOnboardingAction() {
  const master = await requireMaster();
  await db.user.update({ where: { id: master.id }, data: { onboardingDismissedAt: new Date() } });
  revalidatePath("/master");
}
