import Link from "next/link";
import { dismissOnboardingAction } from "@/app/actions/master";
import { Badge, Button, Card, LinkButton, PageHeader, Stat } from "@/components/ui";
import { formatDateTime, formatPercent, toFaDigits } from "@/lib/format";
import { t } from "@/lib/i18n";
import { getOverview } from "@/server/results";
import { requireMaster } from "@/server/session";

const o = t.overview;
export const metadata = { title: o.title };

const STEPS = [
  { key: "student", href: "/master/students/new" },
  { key: "group", href: "/master/groups" },
  { key: "question", href: "/master/questions/new" },
  { key: "exam", href: "/master/exams/new" },
] as const;

export default async function MasterHome() {
  const data = await getOverview(await requireMaster());
  const showOnboarding = data.onboarding && !STEPS.every((s) => data.onboarding![s.key]);
  return (
    <>
      <PageHeader title={o.title} />
      {showOnboarding && (
        <Card
          title={o.onboardingTitle}
          className="mb-5 border-accent/30 bg-accent-soft/40"
          action={
            <form action={dismissOnboardingAction}>
              <Button type="submit" variant="ghost" className="min-h-8 px-2 text-xs">{o.onboardingHide}</Button>
            </form>
          }
        >
          <ol className="space-y-2.5">
            {STEPS.map((step, i) => {
              const done = data.onboarding![step.key];
              return (
                <li key={step.key} className="flex items-center justify-between gap-3 text-sm">
                  <span className={done ? "text-muted line-through" : ""}>{toFaDigits(i + 1)}. {o.onboarding[i]}</span>
                  {done ? <Badge tone="good">{o.done}</Badge> : <LinkButton variant="secondary" href={step.href} className="min-h-8 px-3 text-xs">{o.go}</LinkButton>}
                </li>
              );
            })}
          </ol>
        </Card>
      )}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={o.activeExams} value={toFaDigits(data.activeExams.length)} />
        <Stat label={o.students} value={toFaDigits(data.studentCount)} />
        <Stat label={o.avgScore} value={data.average === null ? "—" : formatPercent(data.average)} />
        <Stat label={o.questions} value={toFaDigits(data.questionCount)} />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title={o.activeExams}>
          {data.activeExams.length === 0 ? (
            <p className="text-sm text-muted">—</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {data.activeExams.map((e) => (
                <li key={e.id} className="flex justify-between gap-3">
                  <Link className="text-accent hover:underline" href={`/master/exams/${e.id}/results`}>{e.title}</Link>
                  <span className="text-xs text-muted">{t.student.endsAt}: {formatDateTime(e.endsAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title={o.recent}>
          {data.recent.length === 0 ? (
            <p className="text-sm text-muted">{o.noRecent}</p>
          ) : (
            <ul className="space-y-2.5 text-sm">
              {data.recent.map((l) => {
                const m = l.meta as Record<string, unknown> | null;
                const d = m?.title ?? m?.name ?? m?.exam;
                return (
                  <li key={l.id} className="flex flex-wrap justify-between gap-x-3">
                    <span>{t.audit.actions[l.action] ?? l.action}{d ? <span className="ms-1 text-muted">«{String(d)}»</span> : null}</span>
                    <span className="text-xs text-muted">{formatDateTime(l.createdAt)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
