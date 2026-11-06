import Link from "next/link";
import { DemoForm } from "@/components/demo-form";
import { LinkButton } from "@/components/ui";
import { toFaDigits } from "@/lib/format";
import { t } from "@/lib/i18n";

const l = t.landing;

export default function Landing() {
  return (
    <div className="mx-auto max-w-4xl px-5">
      <header className="flex items-center justify-between py-5">
        <span className="font-bold text-accent">{t.brand}</span>
        <Link href="/login" className="text-sm hover:underline">{l.ctaLogin}</Link>
      </header>
      <main>
        <section className="py-14 sm:py-20">
          <h1 className="max-w-2xl text-3xl leading-tight font-bold sm:text-4xl sm:leading-tight">{l.title}</h1>
          <p className="mt-5 max-w-2xl leading-8 text-muted">{l.subtitle}</p>
          <div className="mt-7 flex flex-wrap gap-2">
            <LinkButton href="#demo">{l.ctaDemo}</LinkButton>
            <LinkButton href="/login" variant="secondary">{l.ctaLogin}</LinkButton>
          </div>
        </section>
        <section className="border-t border-line py-12">
          <h2 className="text-xl font-bold">{l.problemTitle}</h2>
          <ul className="mt-5 list-disc space-y-2 ps-5 leading-7 text-muted">
            {l.problems.map((p) => <li key={p}>{p}</li>)}
          </ul>
        </section>
        <section className="border-t border-line py-12">
          <h2 className="text-xl font-bold">{l.featuresTitle}</h2>
          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            {l.features.map((f) => (
              <div key={f.title}>
                <h3 className="font-semibold">{f.title}</h3>
                <p className="mt-1.5 text-sm leading-7 text-muted">{f.body}</p>
              </div>
            ))}
          </div>
        </section>
        <section className="border-t border-line py-12">
          <h2 className="text-xl font-bold">{l.stepsTitle}</h2>
          <ol className="mt-5 space-y-3">
            {l.steps.map((s, i) => (
              <li key={s} className="flex gap-3 leading-7">
                <span className="font-bold text-accent">{toFaDigits(i + 1)}</span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
        </section>
        <section id="demo" className="scroll-mt-4 border-t border-line py-12">
          <h2 className="text-xl font-bold">{l.demoTitle}</h2>
          <p className="mt-2 mb-6 text-sm leading-7 text-muted">{l.demoHint}</p>
          <DemoForm />
        </section>
      </main>
      <footer className="border-t border-line py-6 text-xs leading-6 text-muted">{t.common.educational}</footer>
    </div>
  );
}
