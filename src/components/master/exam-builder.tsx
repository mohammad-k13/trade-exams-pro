"use client";

import { useMemo, useState, useTransition } from "react";
import { saveExamAction } from "@/app/actions/master";
import { Alert, Button, Card, Checkbox, Field, Input, Select, Textarea, LinkButton } from "@/components/ui";
import { ConfirmButton } from "@/components/ui/client";
import { JalaliPicker } from "@/components/ui/jalali-picker";
import { formatNumber, toFaDigits } from "@/lib/format";
import { t } from "@/lib/i18n";

const e = t.exams;
const f = e.fields;

export interface BuilderQuestion {
  id: string;
  title: string;
  type: keyof typeof t.questions.types;
  topics: string[];
}

export interface BuilderInitial {
  id: string;
  title: string;
  description: string;
  durationMinutes: number;
  startsAt: string;
  endsAt: string;
  maxAttempts: number;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  reviewPolicy: "NEVER" | "AFTER_SUBMIT" | "AFTER_CLOSE" | "AT_TIME";
  reviewAt: string | null;
  questions: { id: string; points: number }[];
  groupIds: string[];
  studentIds: string[];
}

export function ExamBuilder({
  initial,
  questions,
  groups,
  students,
  now,
}: {
  initial?: BuilderInitial;
  questions: BuilderQuestion[];
  groups: { id: string; name: string; count: number }[];
  students: { id: string; fullName: string }[];
  now: number;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [duration, setDuration] = useState(initial?.durationMinutes ?? 30);
  const [startsAt, setStartsAt] = useState(() => new Date(initial?.startsAt ?? now));
  const [endsAt, setEndsAt] = useState(() => new Date(initial?.endsAt ?? now + 24 * 3_600_000));
  const [maxAttempts, setMaxAttempts] = useState(initial?.maxAttempts ?? 1);
  const [shuffleQuestions, setShuffleQuestions] = useState(initial?.shuffleQuestions ?? false);
  const [shuffleOptions, setShuffleOptions] = useState(initial?.shuffleOptions ?? true);
  const [reviewPolicy, setReviewPolicy] = useState(initial?.reviewPolicy ?? "AFTER_CLOSE");
  const [reviewAt, setReviewAt] = useState(() => new Date(initial?.reviewAt ?? now + 48 * 3_600_000));
  const [picked, setPicked] = useState<{ id: string; points: number }[]>(initial?.questions ?? []);
  const [groupIds, setGroupIds] = useState(new Set(initial?.groupIds ?? []));
  const [studentIds, setStudentIds] = useState(new Set(initial?.studentIds ?? []));
  const [search, setSearch] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const byId = useMemo(() => new Map(questions.map((q) => [q.id, q])), [questions]);
  const pickedIds = new Set(picked.map((p) => p.id));
  const available = questions.filter((q) => !pickedIds.has(q.id) && (!search || q.title.includes(search) || q.topics.some((x) => x.includes(search))));

  function move(index: number, delta: number) {
    const next = [...picked];
    const [item] = next.splice(index, 1);
    next.splice(index + delta, 0, item);
    setPicked(next);
  }

  function payload() {
    return {
      title,
      description,
      durationMinutes: duration,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      maxAttempts,
      shuffleQuestions,
      shuffleOptions,
      reviewPolicy,
      reviewAt: reviewPolicy === "AT_TIME" ? reviewAt.toISOString() : null,
      questionIds: picked.map((p) => p.id),
      points: Object.fromEntries(picked.map((p) => [p.id, p.points])),
      groupIds: [...groupIds],
      studentIds: [...studentIds],
    };
  }

  // Runs inside the caller's transition. A second transition here would block the redirect that
  // follows a successful save, leaving the master on the form with a saved exam.
  async function save(publish: boolean): Promise<{ error: string } | undefined> {
    setError(null);
    const r = await saveExamAction(initial?.id ?? null, payload(), publish);
    if (r?.error) {
      setError(r.error);
      return { error: r.error };
    }
  }

  const toggle = (set: Set<string>, id: string, on: boolean) => {
    const next = new Set(set);
    if (on) next.add(id);
    else next.delete(id);
    return next;
  };

  return (
    <div className="max-w-4xl space-y-5">
      <Card title={t.common.details}>
        <div className="space-y-4">
          <Field label={f.title} htmlFor="exam-title">
            <Input id="exam-title" value={title} onChange={(ev) => setTitle(ev.target.value)} />
          </Field>
          <Field label={f.description} htmlFor="exam-desc">
            <Textarea id="exam-desc" rows={2} value={description} onChange={(ev) => setDescription(ev.target.value)} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={f.startsAt} htmlFor="starts"><JalaliPicker id="starts" value={startsAt} onChange={setStartsAt} /></Field>
            <Field label={f.endsAt} htmlFor="ends"><JalaliPicker id="ends" value={endsAt} onChange={setEndsAt} /></Field>
            <Field label={f.duration} htmlFor="duration">
              <Input id="duration" dir="ltr" type="number" min={1} value={duration} onChange={(ev) => setDuration(Number(ev.target.value))} />
            </Field>
            <Field label={f.maxAttempts} htmlFor="attempts">
              <Input id="attempts" dir="ltr" type="number" min={1} max={20} value={maxAttempts} onChange={(ev) => setMaxAttempts(Number(ev.target.value))} />
            </Field>
            <Field label={f.reviewPolicy} htmlFor="policy">
              <Select id="policy" value={reviewPolicy} onChange={(ev) => setReviewPolicy(ev.target.value as typeof reviewPolicy)}>
                {Object.entries(e.review).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </Field>
            {reviewPolicy === "AT_TIME" && (
              <Field label={f.reviewAt} htmlFor="review-at"><JalaliPicker id="review-at" value={reviewAt} onChange={setReviewAt} /></Field>
            )}
          </div>
          {reviewPolicy === "AFTER_SUBMIT" && <Alert tone="warn">{e.reviewWarn}</Alert>}
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <Checkbox label={f.shuffleQuestions} checked={shuffleQuestions} onChange={(ev) => setShuffleQuestions(ev.target.checked)} />
            <Checkbox label={f.shuffleOptions} checked={shuffleOptions} onChange={(ev) => setShuffleOptions(ev.target.checked)} />
          </div>
        </div>
      </Card>

      <Card title={e.pickQuestions} action={<span className="text-sm text-muted">{toFaDigits(e.selected(picked.length))}</span>}>
        {questions.length === 0 ? (
          <div className="text-sm text-muted">
            <p className="mb-3">{e.bankEmpty}</p>
            <LinkButton href="/master/questions/new" variant="secondary">{t.questions.add}</LinkButton>
          </div>
        ) : (
          <div className="space-y-4">
            {picked.length > 0 && (
              <ol className="space-y-2">
                {picked.map((p, i) => {
                  const q = byId.get(p.id);
                  return (
                    <li key={p.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-line p-2.5 text-sm">
                      <span className="text-muted">{formatNumber(i + 1)}.</span>
                      <span className="min-w-0 flex-1">
                        {q?.title}
                        <span className="ms-2 text-xs text-muted">{q && t.questions.types[q.type]}</span>
                      </span>
                      <label className="flex items-center gap-1.5 text-xs text-muted">
                        {t.common.points}
                        <Input
                          dir="ltr"
                          type="number"
                          min={1}
                          max={100}
                          className="w-16 min-h-8 py-1"
                          value={p.points}
                          onChange={(ev) => setPicked(picked.map((x) => (x.id === p.id ? { ...x, points: Number(ev.target.value) } : x)))}
                        />
                      </label>
                      <Button variant="ghost" className="min-h-8 px-2" aria-label={e.moveUp} disabled={i === 0} onClick={() => move(i, -1)}>↑</Button>
                      <Button variant="ghost" className="min-h-8 px-2" aria-label={e.moveDown} disabled={i === picked.length - 1} onClick={() => move(i, 1)}>↓</Button>
                      <Button variant="ghost" className="min-h-8 px-2" aria-label={e.remove} onClick={() => setPicked(picked.filter((x) => x.id !== p.id))}>×</Button>
                    </li>
                  );
                })}
              </ol>
            )}
            <div>
              <Input placeholder={t.common.search} aria-label={t.common.search} value={search} onChange={(ev) => setSearch(ev.target.value)} className="mb-2" />
              <ul className="max-h-64 divide-y divide-line overflow-y-auto rounded-lg border border-line">
                {available.map((q) => (
                  <li key={q.id} className="flex items-center justify-between gap-2 p-2.5 text-sm">
                    <span className="min-w-0">
                      {q.title}
                      <span className="mt-0.5 block text-xs text-muted">{t.questions.types[q.type]}{q.topics.length ? ` · ${q.topics.join("، ")}` : ""}</span>
                    </span>
                    <Button variant="secondary" className="min-h-8 px-3 text-xs" onClick={() => setPicked([...picked, { id: q.id, points: 1 }])}>{e.add2}</Button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </Card>

      <Card title={e.assign}>
        <div className="grid gap-5 sm:grid-cols-2">
          <fieldset>
            <legend className="mb-2 text-sm font-medium">{e.assignGroups}</legend>
            {groups.length === 0 ? (
              <p className="text-sm text-muted">{t.groups.empty}</p>
            ) : (
              <div className="space-y-2">
                {groups.map((g) => (
                  <Checkbox
                    key={g.id}
                    label={`${g.name} (${toFaDigits(e.assignedCount(g.count))})`}
                    checked={groupIds.has(g.id)}
                    onChange={(ev) => setGroupIds(toggle(groupIds, g.id, ev.target.checked))}
                  />
                ))}
              </div>
            )}
          </fieldset>
          <fieldset>
            <legend className="mb-2 text-sm font-medium">{e.assignStudents}</legend>
            {students.length === 0 ? (
              <p className="text-sm text-muted">{t.students.empty}</p>
            ) : (
              <div className="max-h-56 space-y-2 overflow-y-auto">
                {students.map((s) => (
                  <Checkbox key={s.id} label={s.fullName} checked={studentIds.has(s.id)} onChange={(ev) => setStudentIds(toggle(studentIds, s.id, ev.target.checked))} />
                ))}
              </div>
            )}
          </fieldset>
        </div>
      </Card>

      {error && <Alert>{error}</Alert>}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" disabled={pending} onClick={() => start(async () => void (await save(false)))}>{pending ? t.common.saving : e.saveDraft}</Button>
        <ConfirmButton label={e.publish} variant="primary" message={e.publishConfirm} confirmLabel={e.publish} action={() => save(true)} />
      </div>
    </div>
  );
}
