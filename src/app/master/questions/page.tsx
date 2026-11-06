import Link from "next/link";
import { QuestionRowActions } from "@/components/master/question-row";
import { Badge, Empty, Input, LinkButton, PageHeader, Select, Button, Table } from "@/components/ui";
import { formatDate, toFaDigits } from "@/lib/format";
import { t } from "@/lib/i18n";
import { listQuestions, listTopics } from "@/server/questions";
import { requireMaster } from "@/server/session";

const q = t.questions;
export const metadata = { title: q.title };

const DIFF_TONE = { EASY: "good", MEDIUM: "warn", HARD: "bad" } as const;

export default async function QuestionsPage({ searchParams }: { searchParams: Promise<{ topic?: string; type?: string; difficulty?: string; q?: string }> }) {
  const master = await requireMaster();
  const f = await searchParams;
  const [questions, topics] = await Promise.all([
    listQuestions(master, { topicId: f.topic || undefined, type: f.type || undefined, difficulty: f.difficulty || undefined, search: f.q || undefined }),
    listTopics(master),
  ]);
  const filtered = !!(f.topic || f.type || f.difficulty || f.q);
  return (
    <>
      <PageHeader title={q.title} action={<LinkButton href="/master/questions/new">{q.add}</LinkButton>} />
      {questions.length === 0 && !filtered ? (
        <Empty title={q.empty} hint={q.emptyHint} action={<LinkButton href="/master/questions/new">{q.add}</LinkButton>} />
      ) : (
        <>
          <form className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <Input name="q" defaultValue={f.q} placeholder={t.common.search} aria-label={t.common.search} />
            <Select name="topic" defaultValue={f.topic ?? ""} aria-label={q.filterTopic}>
              <option value="">{q.filterTopic}: {t.common.all}</option>
              {topics.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </Select>
            <Select name="type" defaultValue={f.type ?? ""} aria-label={q.filterType}>
              <option value="">{q.filterType}: {t.common.all}</option>
              {Object.entries(q.types).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
            <Select name="difficulty" defaultValue={f.difficulty ?? ""} aria-label={q.filterDifficulty}>
              <option value="">{q.filterDifficulty}: {t.common.all}</option>
              {Object.entries(q.difficulty).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
            <Button type="submit" variant="secondary">{t.common.search}</Button>
          </form>
          {questions.length === 0 ? (
            <Empty title={q.noMatch} />
          ) : (
            <Table>
              <thead>
                <tr>
                  <th>{q.fields.title}</th>
                  <th>{q.fields.type}</th>
                  <th>{q.fields.topics}</th>
                  <th>{q.fields.difficulty}</th>
                  <th>{t.results.submittedAt}</th>
                  <th>{t.common.actions}</th>
                </tr>
              </thead>
              <tbody>
                {questions.map((x) => (
                  <tr key={x.id}>
                    <td>
                      <Link href={`/master/questions/${x.id}`} className="font-medium text-accent hover:underline">{x.title}</Link>
                      <p dir="ltr" className="mt-0.5 text-end text-xs text-muted">{x.symbol} · {x.timeframe}</p>
                    </td>
                    <td>{q.types[x.type]}</td>
                    <td className="text-muted">{x.topics.map((y) => y.topic.name).join("، ") || "—"}</td>
                    <td><Badge tone={DIFF_TONE[x.difficulty]}>{q.difficulty[x.difficulty]}</Badge></td>
                    <td className="text-muted whitespace-nowrap">{formatDate(x.updatedAt)}<span className="block text-xs">{toFaDigits(q.usedCount(x._count.examQuestions))}</span></td>
                    <td><QuestionRowActions id={x.id} /></td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </>
      )}
    </>
  );
}
