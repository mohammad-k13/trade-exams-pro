import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { t } from "@/lib/i18n";

const BTN = {
  primary: "bg-accent text-white hover:bg-accent-strong",
  secondary: "border border-line bg-white text-ink hover:bg-surface",
  danger: "border border-line bg-white text-bad hover:bg-bad-soft",
  ghost: "text-muted hover:bg-surface hover:text-ink",
};
const BTN_BASE =
  "inline-flex min-h-10 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";

export type ButtonVariant = keyof typeof BTN;

export function Button({ variant = "primary", className = "", ...props }: ComponentProps<"button"> & { variant?: ButtonVariant }) {
  return <button type="button" {...props} className={`${BTN_BASE} ${BTN[variant]} ${className}`} />;
}

export function LinkButton({ variant = "primary", className = "", ...props }: ComponentProps<typeof Link> & { variant?: ButtonVariant }) {
  return <Link {...props} className={`${BTN_BASE} ${BTN[variant]} ${className}`} />;
}

const FIELD =
  "block min-h-10 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm placeholder:text-muted/70 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:bg-surface";

export function Input({ className = "", ...props }: ComponentProps<"input">) {
  return <input {...props} className={`${FIELD} ${className}`} />;
}

export function Textarea({ className = "", ...props }: ComponentProps<"textarea">) {
  return <textarea {...props} className={`${FIELD} ${className}`} />;
}

export function Select({ className = "", ...props }: ComponentProps<"select">) {
  return <select {...props} className={`${FIELD} ${className}`} />;
}

export function Field({ label, hint, htmlFor, children }: { label: string; hint?: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs leading-5 text-muted">{hint}</p>}
    </div>
  );
}

export function Checkbox({ label, hint, ...props }: ComponentProps<"input"> & { label: string; hint?: string }) {
  return (
    <label className="flex items-start gap-2.5 text-sm">
      <input type="checkbox" {...props} className="mt-0.5 size-4 shrink-0 accent-accent" />
      <span>
        {label}
        {hint && <span className="mt-0.5 block text-xs leading-5 text-muted">{hint}</span>}
      </span>
    </label>
  );
}

export function Card({ title, action, className = "", children }: { title?: string; action?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section className={`rounded-xl border border-line bg-white p-4 sm:p-5 ${className}`}>
      {(title || action) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="text-base font-semibold">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm leading-6 text-muted">{subtitle}</p>}
      </div>
      {action && <div className="flex flex-wrap gap-2">{action}</div>}
    </header>
  );
}

const TONES = {
  neutral: "bg-surface text-muted",
  accent: "bg-accent-soft text-accent",
  good: "bg-good-soft text-good",
  bad: "bg-bad-soft text-bad",
  warn: "bg-warn-soft text-warn",
};

export type Tone = keyof typeof TONES;

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${TONES[tone]}`}>{children}</span>;
}

export function Empty({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line px-6 py-12 text-center">
      <p className="font-medium">{title}</p>
      {hint && <p className="mx-auto mt-1.5 max-w-md text-sm leading-6 text-muted">{hint}</p>}
      {action && <div className="mt-4 flex justify-center gap-2">{action}</div>}
    </div>
  );
}

export function Alert({ tone = "bad", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <div role={tone === "bad" ? "alert" : "status"} className={`rounded-lg px-3.5 py-2.5 text-sm leading-6 ${TONES[tone]}`}>
      {children}
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-xl border border-line bg-white p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1.5 text-2xl font-bold">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-line">
      <table className="w-full min-w-[560px] text-sm [&_td]:border-t [&_td]:border-line [&_td]:px-3.5 [&_td]:py-3 [&_th]:bg-surface [&_th]:px-3.5 [&_th]:py-2.5 [&_th]:text-start [&_th]:text-xs [&_th]:font-medium [&_th]:text-muted">
        {children}
      </table>
    </div>
  );
}

export function SkeletonPage() {
  return (
    <div className="animate-pulse space-y-4" aria-label={t.common.loading} role="status">
      <div className="h-7 w-48 rounded bg-surface" />
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="h-24 rounded-xl bg-surface" />
        <div className="h-24 rounded-xl bg-surface" />
        <div className="h-24 rounded-xl bg-surface" />
      </div>
      <div className="h-64 rounded-xl bg-surface" />
    </div>
  );
}
