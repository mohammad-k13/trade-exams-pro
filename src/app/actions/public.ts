"use server";

import { revalidatePath } from "next/cache";
import { run, type ActionResult } from "@/server/action";
import { createOrganization, markDemoHandled, submitDemoRequest } from "@/server/admin";
import { clientIp, requireAdmin } from "@/server/session";

export async function demoRequestAction(_: unknown, form: FormData): Promise<ActionResult<boolean>> {
  // Bots fill every field; people never see this one.
  if (form.get("website")) return { data: true };
  return run(async () => {
    await submitDemoRequest(
      { name: form.get("name"), institute: form.get("institute"), phone: form.get("phone"), message: form.get("message") ?? "" },
      await clientIp(),
    );
    return true;
  });
}

export async function createOrgAction(input: unknown) {
  return run(async () => {
    const r = await createOrganization(await requireAdmin(), input);
    revalidatePath("/admin");
    return r;
  });
}

export async function markDemoHandledAction(id: string) {
  await markDemoHandled(await requireAdmin(), id);
  revalidatePath("/admin");
}
