import { Empty, PageHeader, Table } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { t } from "@/lib/i18n";
import { listAudit } from "@/server/results";
import { requireMaster } from "@/server/session";

const a = t.audit;
export const metadata = { title: a.title };

function detail(meta: unknown): string {
  if (!meta || typeof meta !== "object") return "";
  const m = meta as Record<string, unknown>;
  return String(m.title ?? m.name ?? m.exam ?? "");
}

export default async function AuditPage() {
  const logs = await listAudit(await requireMaster());
  return (
    <>
      <PageHeader title={a.title} />
      {logs.length === 0 ? (
        <Empty title={a.empty} />
      ) : (
        <Table>
          <thead>
            <tr><th>{a.when}</th><th>{a.who}</th><th>{a.what}</th></tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id}>
                <td className="text-xs whitespace-nowrap text-muted">{formatDateTime(l.createdAt)}</td>
                <td>{l.actorName || "—"}</td>
                <td>{a.actions[l.action] ?? l.action}{detail(l.meta) && <span className="ms-1.5 text-muted">«{detail(l.meta)}»</span>}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}
