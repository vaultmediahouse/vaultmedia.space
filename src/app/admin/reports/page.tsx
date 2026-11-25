import type { Metadata } from "next";
import { and, eq, gte, isNotNull, ne, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { Card, PageHeader, Select, Stat, Table, Td, Th } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { formatINR } from "@/lib/money";
import { getSettings } from "@/lib/settings";
import { addDays, billingWeekFor, formatISTDate, weekContaining } from "@/lib/week";
import { clientOptions } from "@/server/queries";

export const metadata: Metadata = { title: "Reports" };

/** Simple metrics (PRD §11): leads/week, approval time, fake-lead %, revenue/week, outstanding. */
export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const { cutoffHour } = await getSettings();
  const current = billingWeekFor(new Date(), cutoffHour);
  const weeks = Array.from({ length: 8 }, (_, i) => weekContaining(addDays(current.weekStart, -7 * i), cutoffHour));
  const since = weeks[weeks.length - 1].previousCutoff;
  const clientCond = (col: AnyPgColumn) => (sp.client ? eq(col, sp.client) : undefined);

  const leads = await db
    .select({ receivedAt: schema.leads.receivedAt, status: schema.leads.status, isDuplicate: schema.leads.isDuplicate })
    .from(schema.leads)
    .where(and(gte(schema.leads.receivedAt, since), clientCond(schema.leads.clientId)));
  const invoices = await db
    .select({ weekStart: schema.invoices.weekStart, total: schema.invoices.total, status: schema.invoices.status })
    .from(schema.invoices)
    .where(and(ne(schema.invoices.status, "void"), clientCond(schema.invoices.clientId)));
  const approvals = await db
    .select({ hours: sql<number>`extract(epoch from (${schema.workItems.sanctionedAt} - least(${schema.workItems.adminApprovedAt}, ${schema.workItems.clientApprovedAt})))/3600`, sanctionedAt: schema.workItems.sanctionedAt })
    .from(schema.workItems)
    .where(and(isNotNull(schema.workItems.sanctionedAt), gte(schema.workItems.sanctionedAt, since), clientCond(schema.workItems.clientId)));
  const outstanding = invoices.filter((i) => i.status === "sent" || i.status === "payment_submitted").reduce((s, i) => s + i.total, 0);

  const rows = weeks.map((w) => {
    const inWeek = leads.filter((l) => l.receivedAt > w.previousCutoff && l.receivedAt <= w.cutoff);
    const fake = inWeek.filter((l) => l.status === "fake" || l.status === "wrong_number").length;
    const appr = approvals.filter((a) => a.sanctionedAt! > w.previousCutoff && a.sanctionedAt! <= w.cutoff);
    const avg = appr.length ? appr.reduce((s, a) => s + Number(a.hours), 0) / appr.length : null;
    return {
      w,
      leads: inWeek.length,
      fakePct: inWeek.length ? Math.round((fake / inWeek.length) * 100) : 0,
      dups: inWeek.filter((l) => l.isDuplicate).length,
      approvalHours: avg,
      revenue: invoices.filter((i) => i.weekStart === w.weekStart).reduce((s, i) => s + i.total, 0),
    };
  });
  const totalLeads = rows.reduce((s, r) => s + r.leads, 0);
  const clients = await clientOptions();
  const q = sp.client ? `client=${sp.client}` : "";

  return (
    <>
      <PageHeader title="Reports" subtitle="Last 8 billing weeks" actions={
        <form action="/admin/reports" className="flex gap-2">
          <Select name="client" defaultValue={sp.client ?? ""} className="w-auto"><option value="">All clients</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.company}</option>)}</Select>
          <button className="rounded-md border border-border bg-white px-3 py-1.5 text-sm">Show</button>
        </form>
      } />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Leads (8 weeks)" value={totalLeads} hint={`${Math.round(totalLeads / 8)} / week avg`} />
        <Stat label="Revenue (8 weeks)" value={formatINR(rows.reduce((s, r) => s + r.revenue, 0))} />
        <Stat label="Avg approval time" value={approvals.length ? `${(approvals.reduce((s, a) => s + Number(a.hours), 0) / approvals.length).toFixed(1)} h` : "—"} hint="first approval → sanctioned" />
        <Stat label="Outstanding" value={formatINR(outstanding)} />
      </div>
      <Card title="By week" actions={<div className="flex gap-3 text-sm"><a className="text-muted hover:underline" href={`/api/export/work?${q}`}>Work CSV</a><a className="text-muted hover:underline" href={`/api/export/leads?${q}`}>Leads CSV</a><a className="text-muted hover:underline" href={`/api/export/ledger?${q}`}>Ledger CSV</a></div>}>
        <Table>
          <thead><tr><Th>Week</Th><Th>Leads</Th><Th>Fake / wrong %</Th><Th>Duplicates</Th><Th>Avg approval</Th><Th>Invoiced</Th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.w.weekStart}>
                <Td>{formatISTDate(r.w.weekStart)} – {formatISTDate(r.w.weekEnd)}</Td>
                <Td>{r.leads}<div className="mt-1 h-1.5 rounded bg-gold" style={{ width: `${Math.min(100, (r.leads / Math.max(1, ...rows.map((x) => x.leads))) * 100)}%` }} /></Td>
                <Td>{r.fakePct}%</Td>
                <Td>{r.dups}</Td>
                <Td>{r.approvalHours === null ? "—" : `${r.approvalHours.toFixed(1)} h`}</Td>
                <Td className="tabular-nums">{formatINR(r.revenue)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
