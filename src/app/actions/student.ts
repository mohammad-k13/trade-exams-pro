"use server";

import { redirect } from "next/navigation";
import { run } from "@/server/action";
import { startAttempt } from "@/server/attempts";
import { requireStudent } from "@/server/session";

export async function startAttemptAction(examId: string) {
  const result = await run(async () => startAttempt(await requireStudent(), examId));
  if (result.error !== undefined) return result;
  redirect(`/student/attempts/${result.data}`);
}
