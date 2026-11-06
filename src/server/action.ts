import { unstable_rethrow } from "next/navigation";
import { t } from "@/lib/i18n";
import { AppError } from "./errors";

export type ActionResult<T = undefined> = { data: T; error?: undefined } | { error: string; data?: undefined };

/** Turns expected failures into a message for the form. Anything else is logged, not shown. */
export async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { data: await fn() };
  } catch (e) {
    unstable_rethrow(e); // redirect() and notFound() work by throwing
    if (e instanceof AppError) return { error: e.message };
    console.error(e);
    return { error: t.common.genericError };
  }
}
