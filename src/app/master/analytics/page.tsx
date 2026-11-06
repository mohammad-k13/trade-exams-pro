import Link from "next/link";
import { AccuracyBar, TopicHeatmap, TrendChart } from "@/components/charts";
import { Button, Card, Empty, PageHeader, Select, Stat } from "@/components/ui";
import { formatDuration, formatPercent, toFaDigits } from "@/lib/format";
import { t } from "@/lib/i18n";
import { getAnalytics } from "@/server/results";
import { requireMaster } from "@/server/session";

const a = t.analytics;
export const metadata = { title: a.title };

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ exam?: string; group?: string }> }) {
  const master = await requireMaster();
  const f = await searchParams;
  const { analytics, exams, groups } = await getAnalytics(master, { examId: f.exam || undefined, groupId: f.group || undefined });
  return (
    <>
      <PageHeader title={a.title} subtitle={a.subtitle} />
      <form className="mb-5 flex flex-wrap gap-2">
        <Select name="exam" defaultValue={f.exam ?? ""} aria-label={a.filterExam} className="w-auto">
          <option value="">{a.allExams}</option>
          {exams.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
        </Select>
        <Select name="group" defaultValue={f.group ?? ""} aria-label={a.filterGroup} className="w-auto">
          <option value="">{a.allGroups}</option>
          {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </Select>
        <Button type="submit" variant="secondary">{t.common.confirm}</Button>
      </form>
      {analytics.answerCount === 0 ? (
        <Empty title={a.empty} hint={a.emptyHint} />
      ) : (
        <div className="space-y-5">
          <Card title={a.insights}>
            <ul className="list-disc space-y-1.5 ps-5 text-sm leading-7">
              {analytics.insights.map((x) => <li key={x}>{x}</li>)}
            </ul>
          </Card>
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label={a.weakestStat} value={analytics.topics[0] ? formatPercent(analytics.topics[0].accuracy) : "—"} hint={analytics.topics[0]?.name} />
            <Stat label={a.hardestStat} value={analytics.hardest[0] ? formatPercent(analytics.hardest[0].accuracy) : "—"} hint={analytics.hardest[0]?.title} />
            <Stat label={a.attention} value={toFaDigits(analytics.attention.length)} />
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            <Card title={a.topicAccuracy}>
              <ul className="space-y-3.5">
                {analytics.topics.map((x) => (
                  <li key={x.id}>
                    <AccuracyBar label={x.name} value={x.accuracy} sublabel={a.answers(toFaDigits(x.total))} />
                  </li>
                ))}
              </ul>
            </Card>
            <Card title={a.trend}>
              {analytics.trend.length >= 2 ? (
                <TrendChart points={analytics.trend.map((p) => ({ id: p.examId, title: p.title, average: p.average, participants: p.participants }))} />
              ) : (
                <p className="text-sm text-muted">{a.needAttemptsForTrend}</p>
              )}
            </Card>
            <Card title={a.hardest}>
              <ul className="space-y-3.5">
                {analytics.hardest.map((q) => (
                  <li key={q.examQuestionId}>
                    <AccuracyBar label={q.title} value={q.accuracy} sublabel={`${t.results.avgTime} ${formatDuration(q.avgTimeMs)}`} />
                  </li>
                ))}
              </ul>
            </Card>
            <Card title={a.wrongOptions}>
              {analytics.wrongOptions.length === 0 ? (
                <p className="text-sm text-muted">{a.empty}</p>
              ) : (
                <ul className="space-y-3 text-sm">
                  {analytics.wrongOptions.map((q) => (
                    <li key={q.examQuestionId} className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0">
                        <span className="block truncate">{q.title}</span>
                        <span className="text-xs text-muted">«{q.topWrong.text}»</span>
                      </span>
                      <span className="shrink-0 font-medium">{formatPercent(q.topWrong.share)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card title={a.attention}>
              {analytics.attention.length === 0 ? (
                <p className="text-sm text-muted">{a.attentionEmpty}</p>
              ) : (
                <ul className="divide-y divide-line text-sm">
                  {analytics.attention.map((s) => (
                    <li key={s.studentId} className="flex flex-wrap items-baseline justify-between gap-2 py-2.5">
                      <Link href={`/master/students/${s.studentId}`} className="font-medium text-accent hover:underline">{s.fullName}</Link>
                      <span className="text-xs text-muted">{s.reasons.join(" · ")}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            {analytics.suspect.length > 0 && (
              <Card title={a.suspect}>
                <p className="mb-3 text-xs leading-5 text-muted">{a.suspectHint}</p>
                <ul className="list-disc space-y-1 ps-5 text-sm">
                  {analytics.suspect.map((q) => <li key={q.examQuestionId}>{q.title}</li>)}
                </ul>
              </Card>
            )}
          </div>
          <Card title={a.heatmap}>
            <TopicHeatmap students={analytics.matrix.students} topics={analytics.matrix.topics} cells={analytics.matrix.cells} />
          </Card>
        </div>
      )}
    </>
  );
}
