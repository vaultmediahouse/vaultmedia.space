import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { ActionButton, ActionForm, SubmitButton } from "@/components/action-form";
import { ClientFields } from "@/components/client-fields";
import { DocStatus, InvoiceStatus } from "@/components/status";
import { Badge, Card, Empty, Field, Input, LinkButton, PageHeader, Table, Td, Th } from "@/components/ui";
import {
  createClientUserAction,
  resetCredentialsAction,
  setClientActiveAction,
  setUserActiveAction,
  updateClientAction,
  updateRateCardAction,
} from "@/actions/admin";
import { formatINR, paiseToRupeesInput } from "@/lib/money";
import { formatISTDate, formatISTDateTime, istDate } from "@/lib/week";
import { getRateCard } from "@/server/rate-cards";
import { latestDocuments, requiredDocsStatus } from "@/server/documents";
import { openWeekPayable } from "@/server/queries";
import { sign } from "@/lib/crypto";
import { CopyButton } from "@/components/copy-button";
import { appUrl } from "@/lib/app-url";

export const metadata: Metadata = { title: "Client" };

export default async function ClientDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const client = await db.query.clients.findFirst({ where: eq(schema.clients.id, id) });
  if (!client) notFound();
  const [rc, users, docs, checklist, invoices, open] = await Promise.all([
    getRateCard(id),
    db.select().from(schema.users).where(eq(schema.users.clientId, id)).orderBy(schema.users.createdAt),
    latestDocuments(id),
    requiredDocsStatus(id),
    db.select().from(schema.invoices).where(eq(schema.invoices.clientId, id)).orderBy(desc(schema.invoices.issuedAt)),
    openWeekPayable(id),
  ]);
  const outstanding = invoices.filter((i) => i.status === "sent" || i.status === "payment_submitted").reduce((s, i) => s + i.total, 0);
  const done = checklist.filter((c) => c.state === "accepted").length;
  const today = istDate(new Date());
  const webhookUrl = `${appUrl()}/api/leads/webhook/${id}?token=${sign(`lead-webhook:${id}`)}`;
  const [activeItems] = await Promise.all([
    db.$count(schema.workItems, and(eq(schema.workItems.clientId, id), inArray(schema.workItems.status, ["proposed", "sanctioned", "in_progress", "delivered", "revision_requested"]))),
  ]);

  return (
    <>
      <PageHeader
        title={<span className="flex items-center gap-2">{client.company} {client.active ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge>}</span>}
        subtitle={[client.contactName, client.phone, client.city].filter(Boolean).join(" · ")}
        actions={
          <>
            <LinkButton href={`/admin/work?client=${id}`}>Work ({activeItems} open)</LinkButton>
            <LinkButton href={`/admin/leads?client=${id}`}>Leads</LinkButton>
            <LinkButton href={`/admin/work/new?client=${id}`} variant="primary">New work item</LinkButton>
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Logins" actions={<span className="text-xs text-muted">Max 3 active per client</span>}>
          {users.length === 0 ? (
            <p className="mb-4 text-sm text-muted">No login yet. Create one and send the message on WhatsApp or Telegram.</p>
          ) : (
            <ul className="mb-4 divide-y divide-border">
              {users.map((u) => (
                <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div>
                    <div className="text-sm font-medium">{u.name} <span className="font-mono text-xs text-muted">@{u.username}</span></div>
                    <div className="text-xs text-muted">
                      {u.active ? (u.mustChangePassword ? "Temporary password — not signed in yet" : `Last login ${formatISTDateTime(u.lastLogin)}`) : "Access removed"}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <ActionForm action={resetCredentialsAction} hidden={{ userId: u.id }} confirm={`Generate a new temporary password for ${u.username}? Their current password stops working.`}>
                      <SubmitButton variant="secondary">Reset password</SubmitButton>
                    </ActionForm>
                    <ActionButton action={setUserActiveAction} hidden={{ userId: u.id, active: String(!u.active) }} variant="ghost">
                      {u.active ? "Remove access" : "Restore access"}
                    </ActionButton>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <ActionForm action={createClientUserAction} hidden={{ clientId: id }} resetOnSuccess className="space-y-3 rounded-md bg-slate-50 p-3">
            <div className="text-sm font-medium">Create login</div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Input name="name" placeholder="Person's name" required defaultValue={users.length === 0 ? client.contactName ?? "" : ""} />
              <Input name="username" placeholder="username" required autoCapitalize="none" pattern="[a-z0-9][a-z0-9._\-]{2,31}" title="lowercase letters, numbers, . _ -" />
              <Input name="email" type="email" placeholder="email (optional)" />
            </div>
            <SubmitButton>Create login + temporary password</SubmitButton>
          </ActionForm>
        </Card>

        <Card title="Rate card" actions={<span className="text-xs text-muted">Updated {formatISTDate(rc.updatedAt)}</span>}>
          <ActionForm action={updateRateCardAction} hidden={{ clientId: id }} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Image creative (₹)"><Input name="imageRate" inputMode="decimal" defaultValue={paiseToRupeesInput(rc.imageRate)} /></Field>
              <Field label="Video creative (₹)"><Input name="videoRate" inputMode="decimal" defaultValue={paiseToRupeesInput(rc.videoRate)} /></Field>
              <Field label="Qualified lead (₹)"><Input name="leadRate" inputMode="decimal" defaultValue={paiseToRupeesInput(rc.leadRate)} /></Field>
              <Field label="Extra revision (₹)"><Input name="revisionRate" inputMode="decimal" defaultValue={paiseToRupeesInput(rc.revisionRate)} /></Field>
              <Field label="Setup fee (₹)"><Input name="setupFee" inputMode="decimal" defaultValue={paiseToRupeesInput(rc.setupFee)} /></Field>
              <Field label="Free revisions per creative"><Input name="freeRevisions" type="number" min={0} defaultValue={rc.freeRevisions} /></Field>
              <Field label="Max video length (sec)"><Input name="maxVideoSeconds" type="number" min={1} defaultValue={rc.maxVideoSeconds} /></Field>
              <Field label="Auto-sanction below (₹)" hint="0 = off"><Input name="autoSanctionLimit" inputMode="decimal" defaultValue={paiseToRupeesInput(rc.autoSanctionLimit)} /></Field>
            </div>
            <SubmitButton>Save rate card</SubmitButton>
          </ActionForm>
        </Card>

        <Card title={`Required documents (${done}/${checklist.length})`} actions={<LinkButton href={`/admin/documents/new?client=${id}`}>New document</LinkButton>}>
          <div className="mb-3 h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full bg-emerald-500" style={{ width: `${(done / checklist.length) * 100}%` }} />
          </div>
          <ul className="mb-4 grid gap-1 text-sm sm:grid-cols-2">
            {checklist.map((c) => (
              <li key={c.type} className="flex items-center justify-between gap-2 rounded px-2 py-1 odd:bg-slate-50">
                <span>{c.label}</span>
                <Badge tone={c.state === "accepted" ? "green" : c.state === "sent" ? "amber" : c.state === "draft" ? "slate" : "red"}>{c.state}</Badge>
              </li>
            ))}
          </ul>
          {docs.length > 0 && (
            <ul className="divide-y divide-border text-sm">
              {docs.map((d) => (
                <li key={d.id} className="flex items-center justify-between py-1.5">
                  <Link href={`/admin/documents/${d.id}`} className="hover:underline">{d.title} <span className="text-xs text-muted">v{d.version}</span></Link>
                  <DocStatus status={d.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Ledger" actions={<a className="text-sm text-muted hover:underline" href={`/api/export/ledger?client=${id}`}>Export CSV</a>}>
          <div className="mb-4 grid grid-cols-3 gap-3 text-sm">
            <div><div className="text-xs text-muted">Outstanding</div><div className="text-lg font-semibold tabular-nums">{formatINR(outstanding)}</div></div>
            <div><div className="text-xs text-muted">Accepted, not invoiced</div><div className="text-lg font-semibold tabular-nums">{formatINR(open.itemsAmount)}</div></div>
            <div><div className="text-xs text-muted">Billable leads, not invoiced</div><div className="text-lg font-semibold tabular-nums">{open.billableLeads} <span className="text-sm font-normal text-muted">({formatINR(open.leadsAmount)})</span></div></div>
          </div>
          {invoices.length === 0 ? (
            <Empty>No invoices yet.</Empty>
          ) : (
            <Table>
              <thead><tr><Th>Invoice</Th><Th>Week</Th><Th>Total</Th><Th>Status</Th></tr></thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id}>
                    <Td><Link className="font-medium hover:underline" href={`/admin/billing/${inv.id}`}>{inv.number}</Link></Td>
                    <Td>{formatISTDate(inv.weekStart.slice(0, 10))} – {formatISTDate(inv.weekEnd)}</Td>
                    <Td className="tabular-nums">{formatINR(inv.total)}</Td>
                    <Td><InvoiceStatus status={inv.status} overdue={inv.dueDate < today} /></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <Card title="Lead webhook (optional)" className="xl:col-span-2">
          <p className="mb-2 text-sm text-muted">Send leads straight into the portal from Zapier / Make / Pabbly or a Meta Lead Ads integration: POST JSON <code className="text-xs">{`{ "name", "phone", "answers": { "question": "answer" } }`}</code> to this URL. Keep it private.</p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="break-all rounded bg-slate-50 px-2 py-1 text-xs">{webhookUrl}</code>
            <CopyButton text={webhookUrl} />
          </div>
        </Card>

        <Card title="Client details" className="xl:col-span-2">
          <ActionForm action={updateClientAction} hidden={{ clientId: id }} className="space-y-4">
            <ClientFields c={client} />
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="requireDocsBeforeWork" defaultChecked={client.requireDocsBeforeWork} className="mt-1" />
              <span>Block new Work Items until the Contract and SOW are accepted</span>
            </label>
            <div className="flex flex-wrap gap-2">
              <SubmitButton>Save details</SubmitButton>
            </div>
          </ActionForm>
          <div className="mt-4 border-t border-border pt-4">
            <ActionButton
              action={setClientActiveAction}
              hidden={{ clientId: id, active: String(!client.active) }}
              variant={client.active ? "danger" : "secondary"}
              confirm={client.active ? "Deactivate this client? All their users are signed out and cannot log in." : undefined}
            >
              {client.active ? "Deactivate client" : "Activate client"}
            </ActionButton>
          </div>
        </Card>
      </div>
    </>
  );
}
