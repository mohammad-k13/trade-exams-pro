import { markDemoHandledAction } from "@/app/actions/public";
import { OrgForm } from "@/components/admin-org-form";
import { Badge, Button, Card, Empty, PageHeader, Table } from "@/components/ui";
import { formatDate, formatDateTime, toFaDigits } from "@/lib/format";
import { t } from "@/lib/i18n";
import { adminOverview } from "@/server/admin";
import { requireAdmin } from "@/server/session";

const a = t.admin;
export const metadata = { title: a.title };

export default async function AdminPage() {
  const { orgs, demoRequests } = await adminOverview(await requireAdmin());
  return (
    <div className="space-y-6">
      <PageHeader title={a.title} />
      <OrgForm />
      {orgs.length === 0 ? (
        <Empty title={a.empty} />
      ) : (
        <Table>
          <thead>
            <tr><th>{a.orgName}</th><th>{a.masters}</th><th>{a.students}</th><th>{a.exams}</th><th>{a.createdAt}</th></tr>
          </thead>
          <tbody>
            {orgs.map((o) => (
              <tr key={o.id}>
                <td className="font-medium">{o.name}</td>
                <td>{o.users.map((u) => u.fullName).join("، ") || "—"}</td>
                <td>{toFaDigits(o.studentCount)}</td>
                <td>{toFaDigits(o._count.exams)}</td>
                <td className="text-muted">{formatDate(o.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <Card title={a.demoRequests}>
        {demoRequests.length === 0 ? (
          <p className="text-sm text-muted">{a.demoEmpty}</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {demoRequests.map((d) => (
              <li key={d.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                <div>
                  <p className="font-medium">{d.name} · {d.institute}</p>
                  <p className="mt-0.5 text-muted">{toFaDigits(d.phone)} · {formatDateTime(d.createdAt)}</p>
                  {d.message && <p className="mt-1 leading-6">{d.message}</p>}
                </div>
                {d.handledAt ? (
                  <Badge tone="good">{a.handled}</Badge>
                ) : (
                  <form action={markDemoHandledAction.bind(null, d.id)}>
                    <Button type="submit" variant="secondary" className="min-h-8 px-3 text-xs">{a.markHandled}</Button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
