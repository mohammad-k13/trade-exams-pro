"use client";

import { useActionState } from "react";
import { demoRequestAction } from "@/app/actions/public";
import { Alert, Button, Field, Input, Textarea } from "@/components/ui";
import { keepValues } from "@/components/ui/client";
import { t } from "@/lib/i18n";

const l = t.landing;

export function DemoForm() {
  const [state, action, pending] = useActionState(demoRequestAction, null);
  if (state?.data) return <Alert tone="good">{l.sent}</Alert>;
  return (
    <form action={action} onSubmit={keepValues(action)} className="grid gap-3 sm:grid-cols-2">
      {state?.error && <div className="sm:col-span-2"><Alert>{state.error}</Alert></div>}
      <Field label={l.name} htmlFor="name"><Input id="name" name="name" required autoComplete="name" /></Field>
      <Field label={l.institute} htmlFor="institute"><Input id="institute" name="institute" required autoComplete="organization" /></Field>
      <Field label={l.phone} htmlFor="phone"><Input id="phone" name="phone" type="tel" required dir="ltr" className="text-start" autoComplete="tel" /></Field>
      <Field label={`${l.message} (${t.common.optional})`} htmlFor="message"><Textarea id="message" name="message" rows={1} /></Field>
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" />
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending}>{pending ? t.common.saving : l.submit}</Button>
        <p className="mt-2 text-xs text-muted">{l.privacy}</p>
      </div>
    </form>
  );
}
