"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/lib/action";
import { Button, cx } from "./ui";
import { CopyButton } from "./copy-button";

type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;

/**
 * A <form> bound to a Server Action via useActionState. Shows the error or success message,
 * optionally resets on success, and can show a copyable payload (e.g. credentials message).
 */
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess = false,
  confirm,
  hidden,
}: {
  action: Action;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  confirm?: string;
  hidden?: Record<string, string>;
}) {
  const [state, formAction] = useActionState(action, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);
  return (
    <form
      ref={ref}
      action={formAction}
      className={className}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {hidden && Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      {children}
      <FormMessage state={state} />
    </form>
  );
}

export function FormMessage({ state }: { state: ActionState }) {
  if (state.error) return <p role="alert" className="mt-2 text-sm text-red-600">{state.error}</p>;
  if (state.ok && (state.message || state.data?.copy)) {
    return (
      <div className="mt-2 text-sm text-emerald-700">
        {state.message}
        {state.data?.copy && (
          <div className="mt-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-slate-800">
            <pre className="whitespace-pre-wrap font-sans text-sm">{state.data.copy}</pre>
            <div className="mt-2 flex flex-wrap gap-2">
              <CopyButton text={state.data.copy} label="Copy message" />
              <a className="text-sm font-medium text-emerald-700 underline" target="_blank" rel="noreferrer" href={`https://wa.me/?text=${encodeURIComponent(state.data.copy)}`}>Open in WhatsApp</a>
              <a className="text-sm font-medium text-sky-700 underline" target="_blank" rel="noreferrer" href={`https://t.me/share/url?url=${encodeURIComponent(state.data.link ?? "")}&text=${encodeURIComponent(state.data.copy)}`}>Open in Telegram</a>
            </div>
          </div>
        )}
      </div>
    );
  }
  return null;
}

export function SubmitButton({ children, variant, className, name, value }: { children: ReactNode; variant?: Parameters<typeof Button>[0]["variant"]; className?: string; name?: string; value?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={pending} className={cx(className)} name={name} value={value}>
      {pending ? "Working…" : children}
    </Button>
  );
}

/** A single-button form, e.g. "Approve". */
export function ActionButton({
  action,
  hidden,
  children,
  variant,
  confirm,
}: {
  action: Action;
  hidden: Record<string, string>;
  children: ReactNode;
  variant?: Parameters<typeof Button>[0]["variant"];
  confirm?: string;
}) {
  return (
    <ActionForm action={action} hidden={hidden} confirm={confirm} className="inline-block">
      <SubmitButton variant={variant}>{children}</SubmitButton>
    </ActionForm>
  );
}
