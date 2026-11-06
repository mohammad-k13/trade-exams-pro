"use client";

import { useActionState } from "react";
import type { FormState } from "@/app/actions/auth";
import { Alert, Button, Field, Input } from "@/components/ui";
import { keepValues } from "@/components/ui/client";
import { t } from "@/lib/i18n";

const a = t.auth;
type Action = (state: FormState, form: FormData) => Promise<FormState>;

export function LoginForm({ action }: { action: Action }) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} onSubmit={keepValues(formAction)} className="space-y-4">
      {state.error && <Alert>{state.error}</Alert>}
      <Field label={a.identifier} htmlFor="identifier">
        <Input id="identifier" name="identifier" required autoComplete="username" dir="ltr" className="text-start" />
      </Field>
      <Field label={a.password} htmlFor="password">
        <Input id="password" name="password" type="password" required autoComplete="current-password" dir="ltr" className="text-start" />
      </Field>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? a.loggingIn : a.login}
      </Button>
    </form>
  );
}

export function PasswordForm({ action, withCurrent, submit }: { action: Action; withCurrent: boolean; submit: string }) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} onSubmit={keepValues(formAction)} className="space-y-4">
      {state.error && <Alert>{state.error}</Alert>}
      {withCurrent && (
        <Field label={a.currentPassword} htmlFor="current">
          <Input id="current" name="current" type="password" required autoComplete="current-password" dir="ltr" className="text-start" />
        </Field>
      )}
      <Field label={a.newPassword} htmlFor="next" hint={a.passwordRule}>
        <Input id="next" name="next" type="password" required minLength={8} autoComplete="new-password" dir="ltr" className="text-start" />
      </Field>
      <Field label={a.repeatPassword} htmlFor="repeat">
        <Input id="repeat" name="repeat" type="password" required minLength={8} autoComplete="new-password" dir="ltr" className="text-start" />
      </Field>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? t.common.saving : submit}
      </Button>
    </form>
  );
}

export function AuthShell({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-surface p-4">
      <div className="w-full max-w-sm rounded-xl border border-line bg-white p-6">
        <p className="mb-5 text-sm font-bold text-accent">{t.brand}</p>
        <h1 className="text-lg font-bold">{title}</h1>
        {hint && <p className="mt-1.5 mb-5 text-sm leading-6 text-muted">{hint}</p>}
        <div className={hint ? "" : "mt-5"}>{children}</div>
      </div>
    </main>
  );
}
