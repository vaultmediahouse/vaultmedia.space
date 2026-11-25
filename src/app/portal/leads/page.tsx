import type { Metadata } from "next";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { db, schema } from "@/db";
import { LeadsTable } from "@/components/leads-table";
import { Card, PageHeader, Stat } from "@/components/ui";
import { requireClient } from "@/lib/auth";
import { billableSince } from "@/lib/lead-rules";
import { getSettings } from "@/lib/settings";
import { addDays, billingWeekFor, formatISTDate, weekContaining } from "@/lib/week";
import Link from "next/link";

export const metadata: Metadata = { title: "My Leads" };

export default async function PortalLeads({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const user = await requireClient();
  const sp = await searchParams;
  const { cutoffHour } = await getSettings();
  const week = sp.week ? weekContaining(sp.week, cutoffHour) : billingWeekFor(new Date(), cutoffHour);
  const leads = await db
    .select()
    .from(schema.leads)
    .where(and(eq(schema.leads.clientId, user.clientId), gte(schema.leads.receivedAt, week.previousCutoff), lte(schema.leads.receivedAt, week.cutoff)))
    .orderBy(desc(schema.leads.receivedAt));
  const now = new Date();
  const billable = leads.filter((l) => l.invoiceId || billableSince(l, now)).length;
  const flagged = leads.filter((l) => l.status === "fake" || l.status === "wrong_number").length;
  const converted = leads.filter((l) => l.status === "converted").length;
  return (
    <>
      <PageHeader
        title="My Leads"
        subtitle={`${formatISTDate(week.weekStart)} – ${formatISTDate(week.weekEnd)}`}
        actions={
          <div className="flex gap-2 text-sm">
            <Link className="rounded-md border border-border bg-white px-3 py-2" href={`/portal/leads?week=${addDays(week.weekStart, -7)}`}>← Previous week</Link>
            <Link className="rounded-md border border-border bg-white px-3 py-2" href={`/portal/leads?week=${addDays(week.weekStart, 7)}`}>Next week →</Link>
            <a className="rounded-md border border-border bg-white px-3 py-2" href={`/api/export/leads?week=${week.weekStart}`}>Download CSV</a>
          </div>
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Received" value={leads.length} />
        <Stat label="Billable" value={billable} />
        <Stat label="Fake / wrong" value={flagged} />
        <Stat label="Converted" value={converted} />
      </div>
      <Card>
        <p className="mb-3 text-sm text-muted">
          Please update each lead after calling. Leads you mark <strong>Fake</strong> or <strong>Wrong Number</strong> within 48 hours of delivery are not billed. Others are billed once 48 hours pass, or as soon as you mark them Contacted / Interested / Converted.
        </p>
        <LeadsTable leads={leads} isAdmin={false} />
      </Card>
    </>
  );
}
