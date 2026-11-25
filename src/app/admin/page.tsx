import type { Metadata } from "next";
import Link from "next/link";
import { Card, PageHeader, Stat, LinkButton } from "@/components/ui";
import { ItemList } from "@/components/work/item-list";
import { formatINR } from "@/lib/money";
import { formatISTDate } from "@/lib/week";
import { itemsNeedingAction, leadsToday, upcomingDue, weekTotals } from "@/server/queries";
import { runAutoAccept } from "@/server/work-items";

export const metadata: Metadata = { title: "Admin home" };

export default async function AdminHome() {
  await runAutoAccept();
  const [t, actions, due, leads] = await Promise.all([weekTotals(), itemsNeedingAction("admin"), upcomingDue(), leadsToday()]);
  return (
    <>
      <PageHeader
        title="This week"
        subtitle={`${formatISTDate(t.week.weekStart)} – ${formatISTDate(t.week.weekEnd)} · cut-off ${t.week.cutoff.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", hour: "numeric", minute: "2-digit" })} IST`}
        actions={<><LinkButton href="/admin/work/new" variant="primary">New work item</LinkButton><LinkButton href="/admin/leads">Add leads</LinkButton></>}
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Sanctioned" value={formatINR(t.sanctioned.amount)} hint={`${t.sanctioned.n} item(s)`} href="/admin/work?status=sanctioned" />
        <Stat label="Delivered" value={formatINR(t.delivered.amount)} hint={`${t.delivered.n} item(s)`} href="/admin/work?status=delivered" />
        <Stat label="Billed" value={formatINR(t.billed)} href="/admin/billing" />
        <Stat label="Paid" value={formatINR(t.paid)} href="/admin/billing" />
        <Stat label="Outstanding" value={formatINR(t.outstanding)} hint="All unpaid invoices" href="/admin/billing" />
        <Stat label="Leads today" value={leads} href="/admin/leads" />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title={`Waiting for my action (${actions.mine.length})`}>
          <ItemList rows={actions.mine} base="/admin/work" empty="Nothing waiting for you." showClient />
        </Card>
        <Card title={`Waiting for client (${actions.theirs.length})`}>
          <ItemList rows={actions.theirs} base="/admin/work" empty="Nothing waiting for the client." showClient />
        </Card>
        <Card title="Upcoming due dates" actions={<Link href="/admin/work" className="text-sm text-muted hover:underline">All work</Link>}>
          <ItemList rows={due} base="/admin/work" empty="No upcoming due dates." showClient />
        </Card>
      </div>
    </>
  );
}
