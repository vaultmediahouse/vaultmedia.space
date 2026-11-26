import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, Field, Input, PageHeader, Select } from "@/components/ui";
import { createDocumentAction } from "@/actions/documents";
import { requireAdmin } from "@/lib/auth";
import { DOC_TYPE_LABEL } from "@/lib/templates";

export const metadata: Metadata = { title: "New document" };

export default async function NewDocument({ searchParams }: { searchParams: Promise<{ client?: string; type?: string }> }) {
  await requireAdmin();
  const { client, type } = await searchParams;
  const clients = await db.select().from(schema.clients).where(eq(schema.clients.active, true));
  const templates = await db.select().from(schema.docTemplates);
  return (
    <>
      <PageHeader title="New document" subtitle="Client details and rates fill in automatically. You can edit everything before sending." />
      <div className="grid max-w-5xl gap-6 lg:grid-cols-2">
      <Card title="Upload your own document" className="h-fit">
        <ActionForm action={createDocumentAction} hidden={{ mode: "upload" }} className="space-y-4">
          <Field label="Client">
            <Select name="clientId" defaultValue={client ?? ""} required>
              <option value="" disabled>Choose…</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.company}</option>)}
            </Select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Type"><Select name="type" defaultValue={type ?? "contract"}>{Object.entries(DOC_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
            <Field label="Title" hint="(optional)"><Input name="title" placeholder="e.g. Service Agreement 2026" /></Field>
          </div>
          <Field label="File" hint="PDF or Word, up to 4 MB">
            <Input type="file" name="file" required accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" />
          </Field>
          <p className="text-xs text-muted">The client sees your file in their portal and accepts it the same way (tick + typed name, time and IP recorded).</p>
          <SubmitButton>Upload as draft</SubmitButton>
        </ActionForm>
      </Card>
      <Card title="Write it here (template or blank)" className="h-fit">
        <ActionForm action={createDocumentAction} className="space-y-4">
          <Field label="Client">
            <Select name="clientId" defaultValue={client ?? ""} required>
              <option value="" disabled>Choose…</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.company}</option>)}
            </Select>
          </Field>
          <Field label="Template">
            <Select name="templateId" defaultValue={(type && templates.find((t) => t.type === type)?.id) || templates[0]?.id || ""}>
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
      </div>
    </>
  );
}
