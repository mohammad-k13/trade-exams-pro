"use client";

import { useEffect, useRef, useState } from "react";
import StudentChart, { type StudentChartHandle } from "@/components/StudentChart";
import { TOOL_LABELS } from "@/lib/tools";
import type { Direction, PublicQuestion, SubmitResponse } from "@/types/question";

type Phase = "loading" | "name" | "solving" | "submitting" | "revealed" | "error";

const NAME_KEY = "tq_student_name";

export default function QuizClient({ questionId }: { questionId: string }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [question, setQuestion] = useState<PublicQuestion | null>(null);
  const [name, setName] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [answer, setAnswer] = useState<Direction | null>(null);
  const [result, setResult] = useState<SubmitResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const chartHandleRef = useRef<StudentChartHandle>(null);

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/questions/${questionId}`)
      .then((res) => {
        if (!res.ok) throw new Error("Question not found");
        return res.json();
      })
      .then((data: PublicQuestion) => {
        if (cancelled) return;
        setQuestion(data);
        const storedName = window.localStorage.getItem(NAME_KEY);
        if (storedName) {
          setName(storedName);
          setPhase("solving");
        } else {
          setPhase("name");
        }
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setError(err.message);
        setPhase("error");
      });

    return () => {
      cancelled = true;
    };
  }, [questionId]);

  function handleNameSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = nameInput.trim();
    if (!trimmed) return;
    window.localStorage.setItem(NAME_KEY, trimmed);
    setName(trimmed);
    setPhase("solving");
  }

  async function handleSubmit() {
    if (!answer) return;
    setPhase("submitting");
    try {
      const res = await fetch(`/api/questions/${questionId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer }),
      });
      if (!res.ok) throw new Error("Could not submit answer");
      const data: SubmitResponse = await res.json();
      setResult(data);
      chartHandleRef.current?.reveal(data.revealCandles);
      setPhase("revealed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setPhase("error");
    }
  }

  if (phase === "loading") {
    return <p className="text-gray-400">Loading question…</p>;
  }

  if (phase === "error") {
    return <p className="text-red-400">{error}</p>;
  }

  if (!question) return null;

  if (phase === "name") {
    return (
      <form onSubmit={handleNameSubmit} className="mx-auto max-w-sm space-y-4">
        <h1 className="text-xl font-semibold text-gray-100">{question.title}</h1>
        <p className="text-sm text-gray-400">Enter your name to start the quiz.</p>
        <input
          autoFocus
          value={nameInput}
          onChange={(e) => setNameInput(e.target.value)}
          placeholder="Your name"
          className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-gray-100 outline-none focus:border-blue-500"
        />
        <button
          type="submit"
          className="w-full rounded-md bg-blue-600 px-3 py-2 font-medium text-white hover:bg-blue-500"
        >
          Start
        </button>
      </form>
    );
  }

  const submitted = phase === "revealed";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-100">{question.title}</h1>
          <p className="text-sm text-gray-400">{question.symbol}</p>
        </div>
        <p className="text-sm text-gray-400">Student: {name}</p>
      </div>

      <p className="text-gray-300">{question.description}</p>

      {!submitted && (
        <div className="flex flex-wrap gap-2">
          {question.allowedTools.map((tool) => (
            <button
              key={tool}
              onClick={() => chartHandleRef.current?.createOverlay(tool)}
              className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-gray-200 hover:border-blue-500 hover:text-blue-400"
            >
              {TOOL_LABELS[tool]}
            </button>
          ))}
        </div>
      )}

      <div className="rounded-lg border border-gray-800 bg-gray-950 p-2">
        <StudentChart ref={chartHandleRef} symbol={question.symbol} candles={question.candles} />
      </div>

      {!submitted && (
        <div className="space-y-3">
          <p className="font-medium text-gray-200">After this setup, does price go up or down?</p>
          <div className="flex gap-3">
            <button
              onClick={() => setAnswer("up")}
              className={`rounded-md px-4 py-2 font-medium ${
                answer === "up"
                  ? "bg-green-600 text-white"
                  : "border border-gray-700 text-gray-200 hover:border-green-500"
              }`}
            >
              Up
            </button>
            <button
              onClick={() => setAnswer("down")}
              className={`rounded-md px-4 py-2 font-medium ${
                answer === "down"
                  ? "bg-red-600 text-white"
                  : "border border-gray-700 text-gray-200 hover:border-red-500"
              }`}
            >
              Down
            </button>
          </div>
          <button
            onClick={handleSubmit}
            disabled={!answer || phase === "submitting"}
            className="rounded-md bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-gray-700 disabled:text-gray-400"
          >
            {phase === "submitting" ? "Submitting…" : "Submit answer"}
          </button>
        </div>
      )}

      {submitted && result && (
        <div
          className={`rounded-lg border p-4 ${
            result.isCorrect
              ? "border-green-700 bg-green-950/40"
              : "border-red-700 bg-red-950/40"
          }`}
        >
          <p className={`font-semibold ${result.isCorrect ? "text-green-400" : "text-red-400"}`}>
            {result.isCorrect ? "Correct!" : "Not quite."}
          </p>
          <p className="mt-1 text-sm text-gray-300">
            Correct answer: <span className="font-medium">{result.correctAnswer}</span>
          </p>
          <p className="mt-1 text-sm text-gray-300">{result.explanation}</p>
        </div>
      )}
    </div>
  );
}
