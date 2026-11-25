import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, Field, Input, PageHeader, Select } from "@/components/ui";
import { createDocumentAction } from "@/actions/documents";
import { requireAdmin } from "@/lib/auth";
import { DOC_TYPE_LABEL } from "@/lib/templates";

export const metadata: Metadata = { title: "New document" };

export default async function NewDocument({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  await requireAdmin();
  const { client } = await searchParams;
  const clients = await db.select().from(schema.clients).where(eq(schema.clients.active, true));
  const templates = await db.select().from(schema.docTemplates);
  return (
    <>
      <PageHeader title="New document" subtitle="Client details and rates fill in automatically. You can edit everything before sending." />
      <Card className="max-w-2xl">
        <ActionForm action={createDocumentAction} className="space-y-4">
          <Field label="Client">
            <Select name="clientId" defaultValue={client ?? ""} required>
              <option value="" disabled>Choose…</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.company}</option>)}
            </Select>
          </Field>
          <Field label="Template">
            <Select name="templateId" defaultValue={templates[0]?.id ?? ""}>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name} ({DOC_TYPE_LABEL[t.type]})</option>)}
              <option value="">Blank document</option>
            </Select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Deposit amount (₹)" hint="(deposit template only)"><Input name="depositAmount" inputMode="decimal" placeholder="e.g. 5000" /></Field>
            <Field label="Title / type" hint="(blank document only)">
              <div className="flex gap-2">
                <Input name="title" placeholder="Title" />
                <Select name="type" defaultValue="other" className="w-36">{Object.entries(DOC_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
              </div>
            </Field>
          </div>
          <p className="rounded-md bg-amber-50 p-3 text-xs text-amber-900">Templates are starting points, not legal advice. Have a lawyer review them once before you use them with clients.</p>
          <SubmitButton>Create draft</SubmitButton>
        </ActionForm>
      </Card>
    </>
  );
}
