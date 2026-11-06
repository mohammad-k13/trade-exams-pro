"use client";

import { startTransition, useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { t } from "@/lib/i18n";
import type { ActionResult } from "@/server/action";
import { Alert, Button, type ButtonVariant } from "./index";

/**
 * React clears a form after its action runs, so a validation error would wipe what the person typed.
 * Pass this as onSubmit next to action={...}; action stays as the fallback without JavaScript.
 */
export function keepValues(action: (form: FormData) => void) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    startTransition(() => action(form));
  };
}

/** A button that asks first and then runs a server action. Used for every destructive step. */
export function ConfirmButton({
  label,
  title,
  message,
  confirmLabel,
  variant = "danger",
  action,
  onDone,
  className,
}: {
  label: ReactNode;
  title?: string;
  message: string;
  confirmLabel?: string;
  variant?: ButtonVariant;
  action: () => Promise<ActionResult<unknown> | void>;
  onDone?: (result: unknown) => void;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run() {
    setError(null);
    start(async () => {
      const result = await action();
      if (result && "error" in result && result.error) {
        setError(result.error);
        return;
      }
      ref.current?.close();
      onDone?.(result && "data" in result ? result.data : undefined);
    });
  }

  return (
    <>
      <Button variant={variant} className={className} onClick={() => ref.current?.showModal()}>
        {label}
      </Button>
      <dialog ref={ref} className="m-auto w-[min(92vw,26rem)] rounded-xl border border-line p-5 text-start">
        <h2 className="font-semibold">{title ?? (typeof label === "string" ? label : t.common.confirm)}</h2>
        <p className="mt-2 text-sm leading-6 text-muted">{message}</p>
        {error && (
          <div className="mt-3">
            <Alert>{error}</Alert>
          </div>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => ref.current?.close()}>
            {t.common.cancel}
          </Button>
          <Button variant={variant === "danger" ? "danger" : "primary"} disabled={pending} onClick={run}>
            {pending ? t.common.saving : (confirmLabel ?? t.common.confirm)}
          </Button>
        </div>
      </dialog>
    </>
  );
}

/** The browser's own file button is labelled in the browser's language, so this one replaces it. */
export function FileInput({ id, accept, onFile }: { id: string; accept: string; onFile: (file: File | undefined) => void }) {
  const [name, setName] = useState<string | null>(null);
  return (
    <label htmlFor={id} className="flex min-h-10 cursor-pointer items-center gap-3 rounded-lg border border-line px-3 py-2 text-sm focus-within:border-accent hover:bg-surface">
      <input
        id={id}
        type="file"
        accept={accept}
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          setName(file?.name ?? null);
          onFile(file);
        }}
      />
      <span className="font-medium text-accent">{t.common.chooseFile}</span>
      <span className="min-w-0 truncate text-muted" dir="auto">{name ?? t.common.noFile}</span>
    </label>
  );
}

export function CopyField({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <code dir="ltr" aria-label={label} className="min-w-0 flex-1 overflow-x-auto rounded-lg border border-line bg-surface px-3 py-2 text-sm whitespace-nowrap">
        {value}
      </code>
      <Button
        variant="secondary"
        onClick={async () => {
          await navigator.clipboard?.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? t.students.copied : t.students.copy}
      </Button>
    </div>
  );
}
