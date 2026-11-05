import { NextResponse } from "next/server";
import { getQuestion, toPublicQuestion } from "@/lib/questions";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const question = getQuestion(id);

  if (!question) {
    return NextResponse.json({ error: "Question not found" }, { status: 404 });
  }

  return NextResponse.json(toPublicQuestion(question));
}
