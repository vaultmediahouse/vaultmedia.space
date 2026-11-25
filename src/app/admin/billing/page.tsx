import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { InvoiceStatus } from "@/components/status";
import { Card, Empty, PageHeader, Select, Stat, Table, Td, Th } from "@/components/ui";
import { generateInvoicesAction } from "@/actions/billing";
import { requireAdmin } from "@/lib/auth";
import { formatINR } from "@/lib/money";
import { getSettings } from "@/lib/settings";
import { billingWeekFor, formatISTDate, istDate, lastClosedWeek } from "@/lib/week";
import { outstandingByClient, previewInvoice } from "@/server/billing";
import { runAutoAccept } from "@/server/work-items";

export const metadata: Metadata = { title: "Billing" };

export default async function AdminBilling({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  await requireAdmin();
  await runAutoAccept();
  const sp = await searchParams;
  const { cutoffHour } = await getSettings();
  const now = new Date();
  const closed = lastClosedWeek(now, cutoffHour);
  const open = billingWeekFor(now, cutoffHour);
  const clients = await db.select().from(schema.clients).where(eq(schema.clients.active, true));
  const outstanding = await outstandingByClient();
  const previews = await Promise.all(clients.map(async (c) => ({ c, closed: await previewInvoice(c.id, closed), open: await previewInvoice(c.id, open) })));
  const invoices = await db
    .select({ inv: schema.invoices, company: schema.clients.company })
    .from(schema.invoices)
    .innerJoin(schema.clients, eq(schema.clients.id, schema.invoices.clientId))
    .where(sp.client ? eq(schema.invoices.clientId, sp.client) : undefined)
    .orderBy(desc(schema.invoices.issuedAt))
    .limit(200);
  const today = istDate(now);
  const totalOutstanding = [...outstanding.values()].reduce((a, b) => a + b, 0);
  const allClients = await db.select({ id: schema.clients.id, company: schema.clients.company }).from(schema.clients);

  return (
    <>
      <PageHeader title="Billing" subtitle="Weekly invoices are generated automatically every Monday for the week that closed Sunday at the cut-off." actions={<a className="rounded-md border border-border bg-white px-3 py-2 text-sm hover:bg-slate-50" href={`/api/export/ledger${sp.client ? `?client=${sp.client}` : ""}`}>Export ledger CSV</a>} />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3">
        <Stat label="Outstanding (all clients)" value={formatINR(totalOutstanding)} />
        <Stat label="Last closed week" value={`${formatISTDate(closed.weekStart)} – ${formatISTDate(closed.weekEnd)}`} hint={`Ready to bill: ${formatINR(previews.reduce((s, p) => s + p.closed.total, 0))}`} />
        <Stat label="Not yet invoiced" value={formatINR(previews.reduce((s, p) => s + p.open.total, 0))} hint="All accepted items + billable leads up to now, incl. last week" />
      </div>

      <Card title="Weekly ledger" className="mb-6" actions={
        <ActionForm action={generateInvoicesAction} confirm="Generate invoices for the last closed week for all active clients?">
          <SubmitButton variant="gold">Generate invoices for {formatISTDate(closed.weekStart)} week</SubmitButton>
        </ActionForm>
      }>
        {previews.length === 0 ? <Empty>No active clients.</Empty> : (
          <Table>
            <thead><tr><Th>Client</Th><Th>Last week: items</Th><Th>Last week: leads</Th><Th>Last week total</Th><Th>Not yet invoiced (to date)</Th><Th>Outstanding</Th></tr></thead>
            <tbody>
              {previews.map(({ c, closed: p, open: o }) => (
                <tr key={c.id}>
                  <Td><Link href={`/admin/clients/${c.id}`} className="font-medium hover:underline">{c.company}</Link></Td>
                  <Td>{p.items.length} ({formatINR(p.items.reduce((s, i) => s + i.amount, 0))})</Td>
                  <Td>{p.leads.length} × {formatINR(p.leadRate)}</Td>
                  <Td className="font-medium tabular-nums">{formatINR(p.total)}</Td>
                  <Td className="tabular-nums">{formatINR(o.total)}</Td>
                  <Td className="tabular-nums">{formatINR(outstanding.get(c.id) ?? 0)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <p className="mt-3 text-xs text-muted">Only items that were approved by both sides and accepted on delivery count, plus leads that passed the 48-hour review. Items accepted after the cut-off roll into next week.</p>
      </Card>

      <Card title="Invoices" actions={
        <form action="/admin/billing" className="flex gap-2">
          <Select name="client" defaultValue={sp.client ?? ""} className="w-auto">
            <option value="">All clients</option>
            {allClients.map((c) => <option key={c.id} value={c.id}>{c.company}</option>)}
          </Select>
          <button className="rounded-md border border-border bg-white px-3 py-1.5 text-sm">Filter</button>
        </form>
      }>
        {invoices.length === 0 ? <Empty>No invoices yet.</Empty> : (
          <Table>
            <thead><tr><Th>Number</Th><Th>Client</Th><Th>Week</Th><Th>Total</Th><Th>Due</Th><Th>Status</Th></tr></thead>
            <tbody>
              {invoices.map(({ inv, company }) => (
                <tr key={inv.id} className="hover:bg-slate-50">
                  <Td><Link href={`/admin/billing/${inv.id}`} className="font-medium hover:underline">{inv.number}</Link></Td>
                  <Td>{company}</Td>
                  <Td>{formatISTDate(inv.weekStart.slice(0, 10))} – {formatISTDate(inv.weekEnd)}</Td>
                  <Td className="tabular-nums">{formatINR(inv.total)}</Td>
                  <Td>{formatISTDate(inv.dueDate)}</Td>
                  <Td><InvoiceStatus status={inv.status} overdue={inv.dueDate < today} /></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
