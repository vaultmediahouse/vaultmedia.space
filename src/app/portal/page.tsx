import type { Metadata } from "next";
import Link from "next/link";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { Card, LinkButton, PageHeader, Stat } from "@/components/ui";
import { ItemList } from "@/components/work/item-list";
import { requireClient } from "@/lib/auth";
import { formatINR } from "@/lib/money";
import { formatISTDate, istDate } from "@/lib/week";
import { itemsNeedingAction, leadsToday, openWeekPayable, recentDeliveries, weekTotals } from "@/server/queries";
import { clientHasOverdueInvoice } from "@/server/billing";
import { requiredDocsStatus } from "@/server/documents";
import { runAutoAccept } from "@/server/work-items";

export const metadata: Metadata = { title: "Home" };

export default async function PortalHome() {
  const user = await requireClient();
  await runAutoAccept();
  const cid = user.clientId;
  const [t, open, actions, deliveries, leads, overdue, docs, pendingDocs] = await Promise.all([
    weekTotals(cid),
    openWeekPayable(cid),
    itemsNeedingAction("client", cid),
    recentDeliveries(cid),
    leadsToday(cid),
    clientHasOverdueInvoice(cid),
    requiredDocsStatus(cid),
    db.select().from(schema.documents).where(and(eq(schema.documents.clientId, cid), inArray(schema.documents.status, ["sent", "viewed"]))),
  ]);
  const unpaid = await db.select().from(schema.invoices).where(and(eq(schema.invoices.clientId, cid), inArray(schema.invoices.status, ["sent"])));
  return (
    <>
      <PageHeader
        title={`Hello, ${user.name.split(" ")[0]}`}
        subtitle={`This week: ${formatISTDate(t.week.weekStart)} – ${formatISTDate(t.week.weekEnd)}`}
        actions={<LinkButton href="/portal/work/new" variant="primary">Request new work</LinkButton>}
      />
      {overdue && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          An invoice is overdue. New creative requests are paused until it is cleared. <Link href="/portal/billing" className="font-medium underline">Go to Billing</Link>
        </div>
      )}
      {pendingDocs.length > 0 && (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {pendingDocs.length} document{pendingDocs.length > 1 ? "s" : ""} waiting for your review: {pendingDocs.map((d) => <Link key={d.id} className="mr-2 font-medium underline" href={`/portal/documents/${d.id}`}>{d.title}</Link>)}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Payable so far (this week)" value={formatINR(open.itemsAmount + open.leadsAmount)} hint={`${formatINR(open.itemsAmount)} work + ${open.billableLeads} leads`} />
        <Stat label="Unpaid invoices" value={formatINR(unpaid.reduce((s, i) => s + i.total, 0))} hint={`${unpaid.length} invoice(s)`} href="/portal/billing" />
        <Stat label="Leads today" value={leads} hint={`${open.pendingLeads} in 48 h review`} href="/portal/leads" />
        <Stat label="Documents" value={`${docs.filter((d) => d.state === "accepted").length}/${docs.filter((d) => d.state === "accepted" || d.state === "sent").length}`} hint="accepted of shared" href="/portal/documents" />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title={`Needs my approval (${actions.mine.length})`}>
          <ItemList rows={actions.mine} base="/portal/work" empty="Nothing waiting for you. 👍" />
        </Card>
        <Card title="Recent deliveries">
          <ItemList rows={deliveries.map((item) => ({ item }))} base="/portal/work" empty="No deliveries yet." />
        </Card>
        <Card title={`Waiting for Vault Media House (${actions.theirs.length})`}>
          <ItemList rows={actions.theirs} base="/portal/work" empty="Nothing pending on our side." />
        </Card>
      </div>
      <p className="mt-6 text-xs text-muted">Today is {formatISTDate(istDate(new Date()))}. Weekly cut-off is Sunday evening; invoices arrive on Monday.</p>
    </>
  );
}
