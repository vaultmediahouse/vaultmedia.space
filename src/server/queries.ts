import "server-only";
import { and, asc, desc, eq, gte, inArray, isNotNull, lte, ne, notInArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { getSettings } from "@/lib/settings";
import { billingWeekFor, istDate, istInstant } from "@/lib/week";
import { billableSince } from "@/lib/lead-rules";
import { needsActionFrom, type Role } from "@/lib/workflow";

/** Read models for dashboards. Pass clientId to scope to one client (always, for client users). */

export async function weekTotals(clientId?: string) {
  const { cutoffHour } = await getSettings();
  const week = billingWeekFor(new Date(), cutoffHour);
  const from = week.previousCutoff;
  const to = week.cutoff;
  const scope = clientId ? eq(schema.workItems.clientId, clientId) : undefined;
  const sum = async (col: typeof schema.workItems.sanctionedAt) => {
    const [r] = await db
      .select({ amount: sql<number>`coalesce(sum(${schema.workItems.amount}),0)::int`, n: sql<number>`count(*)::int` })
      .from(schema.workItems)
      .where(and(scope, gte(col, from), lte(col, to), notInArray(schema.workItems.status, ["cancelled", "rejected"])));
    return r;
  };
  const invScope = clientId ? eq(schema.invoices.clientId, clientId) : undefined;
  const [billed] = await db
    .select({ amount: sql<number>`coalesce(sum(${schema.invoices.total}),0)::int` })
    .from(schema.invoices)
    .where(and(invScope, gte(schema.invoices.issuedAt, from), ne(schema.invoices.status, "void")));
  const [paid] = await db
    .select({ amount: sql<number>`coalesce(sum(${schema.invoices.total}),0)::int` })
    .from(schema.invoices)
    .where(and(invScope, gte(schema.invoices.paidAt, from), eq(schema.invoices.status, "paid")));
  const [outstanding] = await db
    .select({ amount: sql<number>`coalesce(sum(${schema.invoices.total}),0)::int` })
    .from(schema.invoices)
    .where(and(invScope, inArray(schema.invoices.status, ["sent", "payment_submitted"])));
  return {
    week,
    sanctioned: await sum(schema.workItems.sanctionedAt),
    delivered: await sum(schema.workItems.deliveredAt),
    accepted: await sum(schema.workItems.acceptedAt),
    billed: billed.amount,
    paid: paid.amount,
    outstanding: outstanding.amount,
  };
}

/** Running amount payable for the current (open) week: accepted items + billable leads not yet invoiced. */
export async function openWeekPayable(clientId: string) {
  const items = await db
    .select({ amount: schema.workItems.amount })
    .from(schema.workItems)
    .where(and(eq(schema.workItems.clientId, clientId), eq(schema.workItems.status, "accepted")));
  const rc = await db.query.rateCards.findFirst({ where: eq(schema.rateCards.clientId, clientId) });
  const leads = await db
    .select()
    .from(schema.leads)
    .where(and(eq(schema.leads.clientId, clientId), sql`${schema.leads.invoiceId} is null`));
  const now = new Date();
  const billableLeads = leads.filter((l) => billableSince(l, now)).length;
  const pendingLeads = leads.filter((l) => !billableSince(l, now) && !l.isDuplicate && !["fake", "wrong_number"].includes(l.status)).length;
  return {
    itemsAmount: items.reduce((s, i) => s + i.amount, 0),
    billableLeads,
    pendingLeads,
    leadsAmount: billableLeads * (rc?.leadRate ?? 0),
  };
}

export async function itemsNeedingAction(role: Role, clientId?: string) {
  const rows = await db
    .select({ item: schema.workItems, company: schema.clients.company })
    .from(schema.workItems)
    .innerJoin(schema.clients, eq(schema.clients.id, schema.workItems.clientId))
    .where(
      and(
        clientId ? eq(schema.workItems.clientId, clientId) : undefined,
        inArray(schema.workItems.status, ["proposed", "delivered", "sanctioned", "revision_requested"]),
      ),
    )
    .orderBy(asc(schema.workItems.updatedAt));
  const mine = rows.filter((r) => needsActionFrom(r.item, role));
  const other: Role = role === "admin" ? "client" : "admin";
  const theirs = rows.filter((r) => needsActionFrom(r.item, other) && !needsActionFrom(r.item, role));
  return { mine, theirs };
}

export async function upcomingDue(clientId?: string) {
  const today = istDate(new Date());
  return db
    .select({ item: schema.workItems, company: schema.clients.company })
    .from(schema.workItems)
    .innerJoin(schema.clients, eq(schema.clients.id, schema.workItems.clientId))
    .where(
      and(
        clientId ? eq(schema.workItems.clientId, clientId) : undefined,
        isNotNull(schema.workItems.dueDate),
        gte(schema.workItems.dueDate, today),
        inArray(schema.workItems.status, ["sanctioned", "in_progress", "revision_requested", "proposed"]),
      ),
    )
    .orderBy(asc(schema.workItems.dueDate))
    .limit(8);
}

export async function leadsToday(clientId?: string) {
  const start = istInstant(istDate(new Date()));
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.leads)
    .where(and(clientId ? eq(schema.leads.clientId, clientId) : undefined, gte(schema.leads.receivedAt, start)));
  return r.n;
}

export async function recentDeliveries(clientId: string) {
  return db
    .select()
    .from(schema.workItems)
    .where(and(eq(schema.workItems.clientId, clientId), isNotNull(schema.workItems.deliveredAt)))
    .orderBy(desc(schema.workItems.deliveredAt))
    .limit(5);
}

export async function clientOptions() {
  return db
    .select({ id: schema.clients.id, company: schema.clients.company, active: schema.clients.active })
    .from(schema.clients)
    .orderBy(asc(schema.clients.company));
}
