import type { Client } from "@/db/schema";
import { Field, Input, Textarea } from "./ui";

export function ClientFields({ c }: { c?: Client }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Company name *"><Input name="company" required defaultValue={c?.company} /></Field>
      <Field label="Contact person"><Input name="contactName" defaultValue={c?.contactName ?? ""} /></Field>
      <Field label="Phone / WhatsApp"><Input name="phone" defaultValue={c?.phone ?? ""} /></Field>
      <Field label="Email"><Input name="email" type="email" defaultValue={c?.email ?? ""} /></Field>
      <Field label="GST no."><Input name="gstNo" defaultValue={c?.gstNo ?? ""} /></Field>
      <Field label="City"><Input name="city" defaultValue={c?.city ?? ""} /></Field>
      <div className="sm:col-span-2"><Field label="Address"><Input name="address" defaultValue={c?.address ?? ""} /></Field></div>
      <div className="sm:col-span-2"><Field label="Notes (internal)"><Textarea name="notes" rows={3} defaultValue={c?.notes ?? ""} /></Field></div>
    </div>
  );
}
