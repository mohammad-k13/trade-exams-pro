import Link from "next/link";
import { listQuestions } from "@/lib/questions";

export default function Home() {
  const questions = listQuestions();

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-2xl font-semibold text-gray-100">TradingQuiz Pro</h1>
      <p className="mt-2 text-gray-400">
        Demo quizzes (instructor pages not built yet — this is a stand-in share list).
      </p>

      <ul className="mt-8 space-y-3">
        {questions.map((q) => (
          <li key={q.id}>
            <Link
              href={`/quiz/${q.id}`}
              className="block rounded-lg border border-gray-800 bg-gray-900 p-4 hover:border-blue-500"
            >
              <p className="font-medium text-gray-100">{q.title}</p>
              <p className="text-sm text-gray-400">{q.symbol}</p>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
