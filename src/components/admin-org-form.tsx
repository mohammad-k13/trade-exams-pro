"use client";

import { useState, useTransition } from "react";
import { createOrgAction } from "@/app/actions/public";
import { Alert, Button, Card, Field, Input } from "@/components/ui";
import { CopyField } from "@/components/ui/client";
import { t } from "@/lib/i18n";

const a = t.admin;

export function OrgForm() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ username: string; tempPassword: string } | null>(null);
  return (
    <Card title={a.add}>
      <form
        className="grid gap-3 sm:grid-cols-3"
        action={(form) => {
          setError(null);
          setCreated(null);
          start(async () => {
            const r = await createOrgAction({ orgName: form.get("orgName"), masterName: form.get("masterName"), masterUsername: form.get("masterUsername") });
            if (r.error !== undefined) setError(r.error);
            else setCreated(r.data);
          });
        }}
      >
        <Field label={a.orgName} htmlFor="orgName"><Input id="orgName" name="orgName" required /></Field>
        <Field label={a.masterName} htmlFor="masterName"><Input id="masterName" name="masterName" required /></Field>
        <Field label={a.masterUsername} htmlFor="masterUsername"><Input id="masterUsername" name="masterUsername" required dir="ltr" className="text-start" /></Field>
        <div className="sm:col-span-3"><Button type="submit" disabled={pending}>{pending ? t.common.saving : t.common.create}</Button></div>
      </form>
      {error && <div className="mt-3"><Alert>{error}</Alert></div>}
      {created && (
        <div className="mt-4 space-y-2 border-t border-line pt-4">
          <CopyField value={created.username} label={a.masterUsername} />
          <CopyField value={created.tempPassword} label={t.students.tempPassword} />
          <p className="text-xs leading-5 text-muted">{t.students.tempPasswordHint}</p>
        </div>
      )}
    </Card>
  );
}
