"use client";

import { useActionState, useMemo, useState } from "react";
import { createWorkItemAction } from "@/actions/work";
import { Button, Field, Input, Select, Textarea } from "../ui";
import { FormMessage } from "../action-form";

type Rates = { imageRate: number; videoRate: number; leadRate: number; revisionRate: number; maxVideoSeconds: number; autoSanctionLimit: number };

const TYPE_OPTIONS = [
  { v: "image", l: "Image creative" },
  { v: "video", l: "Video / animated creative" },
  { v: "lead_batch", l: "Lead batch" },
  { v: "other", l: "Other task" },
];

function rateFor(type: string, r?: Rates) {
  if (!r) return 0;
  return type === "image" ? r.imageRate : type === "video" ? r.videoRate : type === "lead_batch" ? r.leadRate : 0;
}

export function NewItemForm({
  isAdmin,
  clients,
  rates,
  defaultClientId,
}: {
  isAdmin: boolean;
  clients: { id: string; company: string }[];
  rates: Record<string, Rates>;
  defaultClientId?: string;
}) {
  const [state, action, pending] = useActionState(createWorkItemAction, {});
  const [clientId, setClientId] = useState(defaultClientId ?? clients[0]?.id ?? "");
  const [type, setType] = useState("image");
  const [qty, setQty] = useState(1);
  const r = rates[clientId];
  const defaultRate = rateFor(type, r);
  const [rateOverride, setRateOverride] = useState<string>("");
  const rate = isAdmin && rateOverride !== "" ? Math.round(Number(rateOverride) * 100) : defaultRate;
  const amount = useMemo(() => (Number.isFinite(rate) ? rate * Math.max(1, qty) : 0), [rate, qty]);
  const inr = (p: number) => "₹" + (p / 100).toLocaleString("en-IN");

  return (
    <form action={action} className="space-y-4">
      {isAdmin ? (
        <Field label="Client">
          <Select name="clientId" value={clientId} onChange={(e) => setClientId(e.target.value)} required>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.company}</option>)}
          </Select>
        </Field>
      ) : (
        <input type="hidden" name="clientId" value={clientId} />
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Type">
          <Select name="type" value={type} onChange={(e) => { setType(e.target.value); setRateOverride(""); }}>
            {TYPE_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
          </Select>
        </Field>
        <Field label="Due date" hint="(optional)"><Input type="date" name="dueDate" /></Field>
      </div>
      <Field label="Title"><Input name="title" required placeholder={type === "lead_batch" ? "e.g. Leads – Ahmedabad banks, week 48" : "e.g. Diwali offer post"} /></Field>
      <Field label="Brief / description">
        <Textarea name="brief" rows={4} placeholder={type === "video" ? `Script idea, languages, references. Max ${r?.maxVideoSeconds ?? 30} sec.` : "What should it say or show? Languages, sizes, references."} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Quantity"><Input type="number" name="qty" min={1} value={qty} onChange={(e) => setQty(Number(e.target.value) || 1)} /></Field>
        <Field label="Unit rate (₹)" hint={isAdmin ? "(from rate card, editable)" : "(from your rate card)"}>
          {isAdmin ? (
            <Input name="rate" inputMode="decimal" placeholder={String(defaultRate / 100)} value={rateOverride} onChange={(e) => setRateOverride(e.target.value)} />
          ) : (
            <Input value={String(defaultRate / 100)} disabled readOnly />
          )}
        </Field>
        <Field label="Amount"><div className="rounded-md bg-slate-50 px-3 py-2 text-sm font-semibold tabular-nums">{inr(amount)}</div></Field>
      </div>
      <Field label="Brief file" hint="(optional, max 4 MB; for bigger files add a link after creating)"><Input type="file" name="briefFile" /></Field>
      {r && r.autoSanctionLimit > 0 && amount < r.autoSanctionLimit && (
        <p className="rounded-md bg-blue-50 p-2 text-sm text-blue-800">Below the auto-sanction limit of {inr(r.autoSanctionLimit)}: it will be sanctioned as soon as you submit.</p>
      )}
      <p className="text-sm text-muted">Submitting counts as your approval. {isAdmin ? "The client" : "Vault Media House"} must approve it before work starts.</p>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="intent" value="submit" disabled={pending}>{pending ? "Working…" : "Submit for approval"}</Button>
        <Button type="submit" name="intent" value="draft" variant="secondary" disabled={pending}>Save as draft</Button>
      </div>
      <FormMessage state={state} />
    </form>
  );
}
