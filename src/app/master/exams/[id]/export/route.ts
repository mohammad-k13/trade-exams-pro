import { exportExamCsv } from "@/server/results";
import { jsonError, currentUser } from "@/server/session";
import { AppError } from "@/server/errors";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await currentUser();
    if (!user) throw new AppError("لطفاً دوباره وارد شوید.", 401);
    const { id } = await params;
    const { csv, filename } = await exportExamCsv(user, id);
    return new Response(csv, {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}"` },
    });
  } catch (e) {
    return jsonError(e);
  }
}
