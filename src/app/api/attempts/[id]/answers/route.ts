import { t } from "@/lib/i18n";
import { saveAnswer } from "@/server/attempts";
import { AppError } from "@/server/errors";
import { hit } from "@/server/rate-limit";
import { apiStudent, jsonError } from "@/server/session";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const student = await apiStudent(request);
    if (!(await hit(`save:${student.id}`, 300, 60_000))) throw new AppError(t.common.rateLimited, 429);
    const { id } = await params;
    const body = await request.json().catch(() => {
      throw new AppError(t.common.invalidInput);
    });
    return Response.json(await saveAnswer(student, id, body));
  } catch (e) {
    return jsonError(e);
  }
}
