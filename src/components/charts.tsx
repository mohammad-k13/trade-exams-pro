import { formatPercent } from "@/lib/format";
import { t } from "@/lib/i18n";

// Status thresholds for accuracy. Each level always shows a word and a number, never color alone.
function statusFor(value: number) {
  if (value < 0.5) return { bar: "bg-bad", label: t.result.weak };
  if (value < 0.7) return { bar: "bg-amber-500", label: t.result.medium };
  return { bar: "bg-good", label: t.result.strong };
}

/** Horizontal bar for an accuracy, with an optional tick marking the class average. */
export function AccuracyBar({ label, value, sublabel, marker }: { label: string; value: number; sublabel?: string; marker?: number }) {
  const status = statusFor(value);
  return (
    <div title={`${label}: ${formatPercent(value)}${sublabel ? ` (${sublabel})` : ""}`}>
      <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
        <span className="min-w-0 truncate">{label}</span>
        <span className="shrink-0 font-medium">
          {formatPercent(value)}
          <span className="ms-1.5 text-xs font-normal text-muted">
            {status.label}
            {sublabel ? ` · ${sublabel}` : ""}
          </span>
        </span>
      </div>
      <div className="relative h-2 rounded-full bg-surface">
        <div className={`h-full rounded-e-full ${status.bar}`} style={{ width: `${Math.max(value * 100, 1)}%` }} />
        {marker !== undefined && (
          <span aria-hidden title={t.analytics.classAverage} className="absolute -top-0.5 h-3 w-0.5 bg-ink" style={{ insetInlineStart: `${marker * 100}%` }} />
        )}
      </div>
    </div>
  );
}

/** One series over exams, oldest to newest. The list beneath is the same data as text. */
export function TrendChart({ points }: { points: { id: string; title: string; average: number; participants: number }[] }) {
  const W = 560;
  const H = 150;
  const pad = { top: 16, bottom: 12, side: 28 };
  const x = (i: number) => (points.length === 1 ? W / 2 : pad.side + (i * (W - 2 * pad.side)) / (points.length - 1));
  const y = (v: number) => pad.top + (1 - v) * (H - pad.top - pad.bottom);
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={t.analytics.trend} style={{ direction: "ltr" }}>
        {[0, 0.5, 1].map((g) => (
          <g key={g}>
            <line x1={pad.side} x2={W - pad.side} y1={y(g)} y2={y(g)} stroke="#f1f3f5" />
            <text x={4} y={y(g) + 4} fontSize="10" fill="#5b6472">{formatPercent(g)}</text>
          </g>
        ))}
        <polyline points={points.map((p, i) => `${x(i)},${y(p.average)}`).join(" ")} fill="none" stroke="#1d4ed8" strokeWidth="2" strokeLinejoin="round" />
        {points.map((p, i) => (
          <g key={p.id}>
            <title>{`${p.title}: ${formatPercent(p.average)}`}</title>
            <circle cx={x(i)} cy={y(p.average)} r="14" fill="transparent" />
            <circle cx={x(i)} cy={y(p.average)} r="4.5" fill="#1d4ed8" stroke="#fff" strokeWidth="2" />
            {(i === points.length - 1 || i === 0) && (
              <text x={x(i)} y={y(p.average) - 10} fontSize="11" fontWeight="600" textAnchor="middle" fill="#111827">{formatPercent(p.average)}</text>
            )}
          </g>
        ))}
      </svg>
      <ol className="mt-2 space-y-1 text-xs text-muted">
        {points.map((p) => (
          <li key={p.id} className="flex justify-between gap-3"><span>{p.title}</span><span>{formatPercent(p.average)}</span></li>
        ))}
      </ol>
    </div>
  );
}

/** Student-by-topic table. Darker red means more errors, and every cell also shows its number. */
export function TopicHeatmap({
  students,
  topics,
  cells,
}: {
  students: { id: string; fullName: string }[];
  topics: { id: string; name: string }[];
  cells: Record<string, Record<string, { correct: number; total: number }>>;
}) {
  const shade = (accuracy: number) => {
    const error = 1 - accuracy;
    if (error >= 0.75) return "bg-red-300";
    if (error >= 0.5) return "bg-red-200";
    if (error >= 0.25) return "bg-red-100";
    return "bg-red-50";
  };
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] border-separate border-spacing-0.5 text-xs">
        <thead>
          <tr>
            <th className="p-2 text-start font-medium text-muted">{t.results.student}</th>
            {topics.map((x) => <th key={x.id} className="p-2 text-center font-medium text-muted">{x.name}</th>)}
          </tr>
        </thead>
        <tbody>
          {students.map((s) => (
            <tr key={s.id}>
              <td className="p-2 whitespace-nowrap">{s.fullName}</td>
              {topics.map((x) => {
                const c = cells[s.id]?.[x.id];
                if (!c) return <td key={x.id} className="rounded bg-surface p-2 text-center text-muted">—</td>;
                const acc = c.correct / c.total;
                return (
                  <td key={x.id} title={`${s.fullName}، ${x.name}: ${formatPercent(acc)}`} className={`rounded p-2 text-center text-ink ${shade(acc)}`}>
                    {formatPercent(acc)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-muted">{t.analytics.heatmapLegend}</p>
    </div>
  );
}
