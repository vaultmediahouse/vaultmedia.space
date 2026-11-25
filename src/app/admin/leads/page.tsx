import type { Metadata } from "next";
import { and, desc, eq, gte, inArray, isNull, lte, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { LeadsTable } from "@/components/leads-table";
import { Card, Field, Input, PageHeader, Select, Stat } from "@/components/ui";
import { addLeadAction, importLeadsAction } from "@/actions/leads";
import { requireAdmin } from "@/lib/auth";
import { billableSince } from "@/lib/lead-rules";
import { getSettings } from "@/lib/settings";
import { billingWeekFor, formatISTDate, weekContaining } from "@/lib/week";
import { clientOptions } from "@/server/queries";

export const metadata: Metadata = { title: "Leads" };

export default async function AdminLeads({ searchParams }: { searchParams: Promise<{ client?: string; week?: string; status?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const { cutoffHour } = await getSettings();
  const clients = await clientOptions();
  const companies = new Map(clients.map((c) => [c.id, c.company]));
  const week = sp.week ? weekContaining(sp.week, cutoffHour) : billingWeekFor(new Date(), cutoffHour);
  const conds: SQL[] = [gte(schema.leads.receivedAt, week.previousCutoff), lte(schema.leads.receivedAt, week.cutoff)];
  if (sp.client) conds.push(eq(schema.leads.clientId, sp.client));
  if (sp.status === "flagged") conds.push(inArray(schema.leads.status, ["fake", "wrong_number"]));
  const leads = await db.select().from(schema.leads).where(and(...conds)).orderBy(desc(schema.leads.receivedAt)).limit(1000);
  const now = new Date();
  const billable = leads.filter((l) => l.invoiceId || billableSince(l, now)).length;
  const flagged = leads.filter((l) => l.status === "fake" || l.status === "wrong_number").length;
  const dups = leads.filter((l) => l.isDuplicate).length;
  const replaceable = await db
    .select()
    .from(schema.leads)
    .where(and(inArray(schema.leads.status, ["fake", "wrong_number"]), isNull(schema.leads.replacedBy), sp.client ? eq(schema.leads.clientId, sp.client) : undefined))
    .orderBy(desc(schema.leads.receivedAt))
    .limit(50);
  const defaultClient = sp.client ?? clients.find((c) => c.active)?.id ?? "";

  return (
    <>
      <PageHeader title="Leads" subtitle={`Week ${formatISTDate(week.weekStart)} – ${formatISTDate(week.weekEnd)} (to Sunday cut-off)`} actions={<a className="rounded-md border border-border bg-white px-3 py-2 text-sm hover:bg-slate-50" href={`/api/export/leads?${new URLSearchParams({ ...(sp.client ? { client: sp.client } : {}), week: week.weekStart }).toString()}`}>Export CSV</a>} />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Received" value={leads.length} />
        <Stat label="Billable so far" value={billable} />
        <Stat label="Fake / wrong" value={flagged} hint={leads.length ? `${Math.round((flagged / leads.length) * 100)}%` : undefined} />
        <Stat label="Duplicates" value={dups} />
      </div>
      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Card title="Add a lead">
          <ActionForm action={addLeadAction} resetOnSuccess className="space-y-3">
            <Select name="clientId" defaultValue={defaultClient} required>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.company}</option>)}
            </Select>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input name="name" placeholder="Name" required />
              <Input name="phone" placeholder="Phone (+91…)" required />
              <Input name="question" placeholder="Question (default: Business / use case)" />
              <Input name="answer" placeholder="Answer" required />
            </div>
            {replaceable.length > 0 && (
              <Field label="Replaces lead" hint="(optional — for a Fake/Wrong lead)">
                <Select name="replacesId" defaultValue="">
                  <option value="">— Not a replacement —</option>
                  {replaceable.map((l) => <option key={l.id} value={l.id}>{l.name ?? l.phone} · {formatISTDate(l.receivedAt)} · {companies.get(l.clientId)}</option>)}
                </Select>
              </Field>
            )}
            <SubmitButton>Add lead</SubmitButton>
          </ActionForm>
        </Card>
        <Card title="Import CSV (Meta lead form export or any sheet)">
          <ActionForm action={importLeadsAction} resetOnSuccess className="space-y-3">
            <Select name="clientId" defaultValue={defaultClient} required>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.company}</option>)}
            </Select>
            <Input type="file" name="file" accept=".csv,.tsv,text/csv" required />
            <p className="text-xs text-muted">Recognised columns: full_name / name, phone_number / phone / mobile, created_time / date. Every other column becomes a form answer. Re-importing the same file skips leads already imported.</p>
            <SubmitButton>Import</SubmitButton>
          </ActionForm>
        </Card>
      </div>
      <Card>
        <form className="mb-4 flex flex-wrap gap-2" action="/admin/leads">
          <Select name="client" defaultValue={sp.client ?? ""} className="w-auto">
            <option value="">All clients</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.company}</option>)}
          </Select>
          <input type="date" name="week" defaultValue={sp.week ?? ""} title="Any date in the week" className="rounded-md border border-border px-3 py-2 text-sm" />
          <Select name="status" defaultValue={sp.status ?? ""} className="w-auto">
            <option value="">All</option>
            <option value="flagged">Fake / wrong only</option>
          </Select>
          <button className="rounded-md border border-border bg-white px-3 py-2 text-sm hover:bg-slate-50">Show</button>
        </form>
        <LeadsTable leads={leads} isAdmin companies={companies} />
      </Card>
    </>
  );
}
