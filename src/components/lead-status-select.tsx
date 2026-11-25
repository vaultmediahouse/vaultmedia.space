"use client";

import { useActionState, useRef } from "react";
import { leadAction } from "@/actions/leads";
import type { LeadStatus } from "@/db/schema";

/** One-click status change: submits as soon as the client picks a value. */
export function LeadStatusSelect({ id, status, options }: { id: string; status: LeadStatus; options: [LeadStatus, string][] }) {
  const [state, action, pending] = useActionState(leadAction, {});
  const ref = useRef<HTMLFormElement>(null);
  return (
    <form ref={ref} action={action}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="op" value="status" />
      <select
        name="status"
        defaultValue={status}
        disabled={pending}
        aria-label="Lead status"
        onChange={() => ref.current?.requestSubmit()}
        className={`rounded-md border px-2 py-1 text-xs ${status === "fake" || status === "wrong_number" ? "border-red-300 bg-red-50 text-red-700" : status === "new" ? "border-border bg-white" : "border-emerald-300 bg-emerald-50 text-emerald-800"}`}
      >
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      {state.error && <div className="mt-1 text-[11px] text-red-600">{state.error}</div>}
    </form>
  );
}
