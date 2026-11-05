import { NextResponse } from "next/server";
import { getQuestion } from "@/lib/questions";
import type { Direction, SubmitResponse } from "@/types/question";

function isDirection(value: unknown): value is Direction {
  return value === "up" || value === "down";
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const question = getQuestion(id);

  if (!question) {
    return NextResponse.json({ error: "Question not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const answer = body?.answer;

  if (!isDirection(answer)) {
    return NextResponse.json(
      { error: "answer must be 'up' or 'down'" },
      { status: 400 },
    );
  }

  const response: SubmitResponse = {
    isCorrect: answer === question.correctAnswer,
    correctAnswer: question.correctAnswer,
    explanation: question.explanation,
    revealCandles: question.revealCandles,
  };

  return NextResponse.json(response);
}
