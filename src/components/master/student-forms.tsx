"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  createStudentAction,
  importStudentsAction,
  inviteAction,
  resetPasswordAction,
  setStudentActiveAction,
  updateStudentAction,
} from "@/app/actions/master";
import { Alert, Button, Card, Checkbox, Field, Input, LinkButton } from "@/components/ui";
import { ConfirmButton, CopyField, FileInput } from "@/components/ui/client";
import { toFaDigits } from "@/lib/format";
import { t } from "@/lib/i18n";
import type { ImportResult } from "@/server/students";

const s = t.students;

export function StudentForm({
  groups,
  student,
}: {
  groups: { id: string; name: string }[];
  student?: { id: string; fullName: string; username: string; phone: string | null; groupIds: string[] };
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ fullName: string; username: string; tempPassword: string } | null>(null);
  const [saved, setSaved] = useState(false);
  const [selected, setSelected] = useState(new Set(student?.groupIds ?? []));

  function submit(form: FormData) {
    setError(null);
    setSaved(false);
    const input = {
      fullName: String(form.get("fullName")),
      username: String(form.get("username")),
      phone: String(form.get("phone")),
      groupIds: [...selected],
    };
    start(async () => {
      if (student) {
        const r = await updateStudentAction(student.id, input);
        if (r.error) setError(r.error);
        else setSaved(true);
      } else {
        const r = await createStudentAction(input);
        if (r.error !== undefined) setError(r.error);
        else setCreated({ fullName: r.data.student.fullName, username: r.data.student.username, tempPassword: r.data.tempPassword });
      }
    });
  }

  if (created) {
    return (
      <Card className="max-w-lg">
        <Alert tone="good">{s.created}</Alert>
        <dl className="mt-4 space-y-3 text-sm">
          <div>
            <dt className="mb-1 text-muted">{s.username}</dt>
            <dd><CopyField value={created.username} /></dd>
          </div>
          <div>
            <dt className="mb-1 text-muted">{s.tempPassword}</dt>
            <dd><CopyField value={created.tempPassword} /></dd>
          </div>
        </dl>
        <p className="mt-3 text-xs leading-5 text-muted">{s.tempPasswordHint}</p>
        <div className="mt-4 flex gap-2">
          <Button onClick={() => setCreated(null)}>{s.add}</Button>
          <LinkButton variant="secondary" href="/master/students">{t.common.back}</LinkButton>
        </div>
      </Card>
    );
  }

  return (
    <Card className="max-w-lg">
      <form action={submit} className="space-y-4">
        {error && <Alert>{error}</Alert>}
        {saved && <Alert tone="good">{t.common.saved}</Alert>}
        <Field label={s.fullName} htmlFor="fullName">
          <Input id="fullName" name="fullName" required defaultValue={student?.fullName} />
        </Field>
        <Field label={s.username} htmlFor="username" hint={t.validation.username}>
          <Input id="username" name="username" required defaultValue={student?.username} dir="ltr" className="text-start" autoComplete="off" />
        </Field>
        <Field label={`${s.phone} (${t.common.optional})`} htmlFor="phone">
          <Input id="phone" name="phone" type="tel" defaultValue={student?.phone ?? ""} dir="ltr" className="text-start" />
        </Field>
        {groups.length > 0 && (
          <fieldset>
            <legend className="mb-2 text-sm font-medium">{s.groups}</legend>
            <div className="space-y-2">
              {groups.map((g) => (
                <Checkbox
                  key={g.id}
                  label={g.name}
                  checked={selected.has(g.id)}
                  onChange={(e) => {
                    const next = new Set(selected);
                    if (e.target.checked) next.add(g.id);
                    else next.delete(g.id);
                    setSelected(next);
                  }}
                />
              ))}
            </div>
          </fieldset>
        )}
        <div className="flex gap-2">
          <Button type="submit" disabled={pending}>{pending ? t.common.saving : student ? t.common.save : s.add}</Button>
          <Button variant="secondary" onClick={() => router.push("/master/students")}>{t.common.cancel}</Button>
        </div>
      </form>
    </Card>
  );
}

export function StudentActions({ id, isActive }: { id: string; isActive: boolean }) {
  const [secret, setSecret] = useState<{ label: string; value: string; hint: string } | null>(null);
  return (
    <Card title={t.common.actions} className="max-w-lg">
      <div className="flex flex-wrap gap-2">
        <ConfirmButton
          label={s.resetPassword}
          variant="secondary"
          message={s.resetConfirm}
          action={() => resetPasswordAction(id)}
          onDone={(v) => setSecret({ label: s.tempPassword, value: String(v), hint: s.tempPasswordHint })}
        />
        <ConfirmButton
          label={s.invite}
          variant="secondary"
          message={s.inviteHint}
          action={() => inviteAction(id)}
          onDone={(v) => setSecret({ label: s.invite, value: String(v), hint: s.inviteHint })}
        />
        {isActive ? (
          <ConfirmButton label={s.deactivate} message={s.deactivateConfirm} action={() => setStudentActiveAction(id, false)} />
        ) : (
          <ConfirmButton label={s.activate} variant="secondary" message={s.activate} action={() => setStudentActiveAction(id, true)} />
        )}
      </div>
      {secret && (
        <div className="mt-4 space-y-2">
          <p className="text-sm text-muted">{secret.label}</p>
          <CopyField value={secret.value} />
          <p className="text-xs leading-5 text-muted">{secret.hint}</p>
        </div>
      )}
    </Card>
  );
}

function downloadCsv(filename: string, rows: string[][]) {
  // Temp passwords are random, but names come from a file, so neutralise formula prefixes here too.
  const safe = (c: string) => (/^[=+\-@\t\r]/.test(c) ? `'${c}` : c);
  const body = "﻿" + rows.map((r) => r.map((c) => `"${safe(c).replace(/"/g, '""')}"`).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([body], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function ImportForm() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [file, setFile] = useState<File | null>(null);

  function run() {
    if (!file) return;
    setError(null);
    start(async () => {
      const r = await importStudentsAction(await file.text());
      if (r.error !== undefined) setError(r.error);
      else setResult(r.data);
    });
  }

  return (
    <Card className="max-w-2xl">
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <Field label={s.importFile} htmlFor="csv" hint={s.importHint}>
          <FileInput id="csv" accept=".csv,text/csv" onFile={(f) => setFile(f ?? null)} />
        </Field>
        <pre dir="ltr" className="overflow-x-auto rounded-lg bg-surface p-3 text-start text-xs leading-5 text-muted">
          full_name,username,phone,group{"\n"}علی رضایی,ali.rezaei,09121234567,کلاس فارکس
        </pre>
        <Button onClick={run} disabled={!file || pending}>{pending ? t.common.saving : s.importRun}</Button>
        {result && (
          <div className="space-y-3 border-t border-line pt-4">
            <Alert tone={result.created.length ? "good" : "warn"}>{toFaDigits(s.importDone(result.created.length))}</Alert>
            {result.created.length > 0 && (
              <>
                <p className="text-sm leading-6 text-muted">{s.importResultHint}</p>
                <Button
                  variant="secondary"
                  onClick={() =>
                    downloadCsv("temp-passwords.csv", [
                      ["full_name", "username", "temp_password"],
                      ...result.created.map((c) => [c.fullName, c.username, c.tempPassword]),
                    ])
                  }
                >
                  {s.downloadPasswords}
                </Button>
              </>
            )}
            {result.errors.length > 0 && (
              <div>
                <p className="mb-1 text-sm font-medium">{s.importErrors}</p>
                <ul className="space-y-1 text-sm text-bad">
                  {result.errors.map((e) => (
                    <li key={e.row}>{toFaDigits(s.importRow(e.row, e.message))}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
