import { submitAttempt } from "@/server/attempts";
import { apiStudent, jsonError } from "@/server/session";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const student = await apiStudent(request);
    const { id } = await params;
    await submitAttempt(student, id);
    return Response.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
