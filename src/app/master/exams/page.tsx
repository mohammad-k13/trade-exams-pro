import Link from "next/link";
import { Badge, Empty, LinkButton, PageHeader, Table, type Tone } from "@/components/ui";
import { formatDateTime, toFaDigits } from "@/lib/format";
import { t } from "@/lib/i18n";
import { listExams } from "@/server/exams";
import { requireMaster } from "@/server/session";

const e = t.exams;
export const metadata = { title: e.title };

const STATUS_TONE: Record<string, Tone> = { draft: "neutral", scheduled: "warn", active: "accent", closed: "good" };

export default async function ExamsPage() {
  const exams = await listExams(await requireMaster());
  return (
    <>
      <PageHeader title={e.title} action={<LinkButton href="/master/exams/new">{e.add}</LinkButton>} />
      {exams.length === 0 ? (
        <Empty title={e.empty} hint={e.emptyHint} action={<LinkButton href="/master/exams/new">{e.add}</LinkButton>} />
      ) : (
        <Table>
          <thead>
            <tr>
              <th>{e.fields.title}</th>
              <th>{e.window}</th>
              <th>{e.pickQuestions}</th>
              <th>{t.results.attempt}</th>
              <th>{t.students.status}</th>
            </tr>
          </thead>
          <tbody>
            {exams.map((x) => (
              <tr key={x.id}>
                <td><Link href={`/master/exams/${x.id}`} className="font-medium text-accent hover:underline">{x.title}</Link></td>
                <td className="text-xs leading-5 text-muted">{formatDateTime(x.startsAt)}<br />{formatDateTime(x.endsAt)}</td>
                <td>{toFaDigits(x._count.questions)}</td>
                <td>{toFaDigits(x._count.attempts)}</td>
                <td><Badge tone={STATUS_TONE[x.displayStatus]}>{e.status[x.displayStatus]}</Badge></td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}
