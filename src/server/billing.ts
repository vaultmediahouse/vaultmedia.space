import "server-only";
import { and, eq, inArray, isNull, lt, lte, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Invoice, Lead, User, WorkItem } from "@/db/schema";
import { billableSince } from "@/lib/lead-rules";
import { taxFor, formatINR } from "@/lib/money";
import { getSettings, saveSettings } from "@/lib/settings";
import { addDays, istDate, lastClosedWeek, type BillingWeek } from "@/lib/week";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { TYPE_LABEL } from "@/lib/workflow";
import { getRateCard } from "./rate-cards";

/**
 * Weekly billing (PRD §2.3, §5 Billing, §15).
 *
 * An invoice for week W (Mon–Sun, cut-off Sunday 20:00 IST) contains:
 *   - every Work Item in status `accepted` (so it passed dual approval AND delivery acceptance),
 *     accepted at or before the cut-off and not yet invoiced; and
 *   - every lead whose billableSince() is at or before the cut-off and not yet invoiced.
 * Anything that became billable before W but was missed (e.g. invoices were not run) is caught up.
 * Invoices are idempotent per (client, week): running the job twice does nothing the second time.
 */

export type BillingPreview = {
  week: BillingWeek;
  items: WorkItem[];
  leads: Lead[];
  leadRate: number;
  lines: { kind: "work_item" | "leads"; workItemId: string | null; description: string; qty: number; rate: number; amount: number }[];
  subtotal: number;
  taxRateBps: number;
  tax: number;
  total: number;
};

export async function previewInvoice(clientId: string, week: BillingWeek): Promise<BillingPreview> {
  const settings = await getSettings();
  const rc = await getRateCard(clientId);
  const items = await db
    .select()
    .from(schema.workItems)
    .where(
      and(
        eq(schema.workItems.clientId, clientId),
        eq(schema.workItems.status, "accepted"),
        isNull(schema.workItems.invoiceId),
        lte(schema.workItems.acceptedAt, week.cutoff),
      ),
    )
    .orderBy(schema.workItems.number);
  const candidates = await db
    .select()
    .from(schema.leads)
    .where(
      and(
        eq(schema.leads.clientId, clientId),
        isNull(schema.leads.invoiceId),
        lt(schema.leads.receivedAt, week.cutoff),
      ),
    );
  const leads = candidates.filter((l) => {
    const since = billableSince(l, week.cutoff);
    return since !== null && since <= week.cutoff;
  });

  const lines: BillingPreview["lines"] = items.map((i) => ({
    kind: "work_item",
    workItemId: i.id,
    description: `#${i.number} ${TYPE_LABEL[i.type]}: ${i.title}`,
    qty: i.qty,
    rate: i.rate,
    amount: i.amount,
  }));
  if (leads.length) {
    lines.push({
      kind: "leads",
      workItemId: null,
      description: `Interested leads (qualified), ${week.weekStart} to ${week.weekEnd}`,
      qty: leads.length,
      rate: rc.leadRate,
      amount: leads.length * rc.leadRate,
    });
  }
  const subtotal = lines.reduce((s, l) => s + l.amount, 0);
  const taxRateBps = settings.gstEnabled ? settings.gstRateBps : 0;
  const tax = taxFor(subtotal, taxRateBps);
  return { week, items, leads, leadRate: rc.leadRate, lines, subtotal, taxRateBps, tax, total: subtotal + tax };
}

/** Create the invoice for one client and week. Returns null when there is nothing to bill. */
export async function generateInvoice(
  actor: User | null,
  clientId: string,
  week: BillingWeek,
): Promise<Invoice | null> {
  const existing = await db.query.invoices.findFirst({
    where: and(eq(schema.invoices.clientId, clientId), eq(schema.invoices.weekStart, week.weekStart)),
  });
  if (existing) return null;

  const p = await previewInvoice(clientId, week);
  if (p.lines.length === 0) return null;

  // Make sure the settings row exists (with nextInvoiceNumber) before incrementing it.
  const settings = await saveSettings({});
  const now = new Date();
  const invoice = await db.transaction(async (tx) => {
    // Reserve the next invoice number atomically (row lock on the settings row).
    const { rows } = await tx.execute<{ n: number }>(sql`
      update settings
      set value = jsonb_set(value, '{nextInvoiceNumber}', to_jsonb((value->>'nextInvoiceNumber')::int + 1)),
          updated_at = now()
      where key = 'app'
      returning (value->>'nextInvoiceNumber')::int - 1 as n
    `);
    const seq = Number(rows[0].n);
    const number = `${settings.invoicePrefix}-${week.weekStart.slice(0, 4)}-${String(seq).padStart(4, "0")}`;

    const [inv] = await tx
      .insert(schema.invoices)
      .values({
        clientId,
        number,
        weekStart: week.weekStart,
        weekEnd: week.weekEnd,
        subtotal: p.subtotal,
        taxRateBps: p.taxRateBps,
        tax: p.tax,
        total: p.total,
        status: "sent",
        issuedAt: now,
        dueDate: addDays(istDate(now), settings.paymentWindowDays),
      })
      .returning();
    await tx.insert(schema.invoiceLines).values(p.lines.map((l) => ({ ...l, invoiceId: inv.id })));

    if (p.items.length) {
      const updated = await tx
        .update(schema.workItems)
        .set({ status: "billed", invoiceId: inv.id, updatedAt: now })
        .where(and(inArray(schema.workItems.id, p.items.map((i) => i.id)), eq(schema.workItems.status, "accepted"), isNull(schema.workItems.invoiceId)))
        .returning({ id: schema.workItems.id });
      if (updated.length !== p.items.length) throw new Error("Work items changed during invoicing. Run it again.");
    }
    if (p.leads.length) {
      await tx
        .update(schema.leads)
        .set({ invoiceId: inv.id })
        .where(inArray(schema.leads.id, p.leads.map((l) => l.id)));
    }
    await audit({ userId: actor?.id ?? null, clientId, entity: "invoice", entityId: inv.id, action: "generate", after: { number, subtotal: p.subtotal, tax: p.tax, total: p.total, items: p.items.length, leads: p.leads.length } }, tx);
    return inv;
  });

  await notify({ clientId }, { event: "invoice_ready", title: `Invoice ${invoice.number} ready: ${formatINR(invoice.total)}`, href: `/portal/billing/${invoice.id}` });
  await notify({ admins: true }, { event: "invoice_ready", title: `Invoice ${invoice.number} generated: ${formatINR(invoice.total)}`, href: `/admin/billing/${invoice.id}` });
  return invoice;
}

/** Monday job: invoice the last closed week for every active client. */
export async function runWeeklyInvoices(actor: User | null, now = new Date()) {
  const { cutoffHour } = await getSettings();
  const week = lastClosedWeek(now, cutoffHour);
  const clients = await db.select().from(schema.clients).where(eq(schema.clients.active, true));
  const created: Invoice[] = [];
  for (const c of clients) {
    const inv = await generateInvoice(actor, c.id, week);
    if (inv) created.push(inv);
  }
  return { week, created };
}

export async function clientHasOverdueInvoice(clientId: string, now = new Date()): Promise<boolean> {
  const today = istDate(now);
  const overdue = await db.query.invoices.findFirst({
    where: and(
      eq(schema.invoices.clientId, clientId),
      inArray(schema.invoices.status, ["sent"]),
      lt(schema.invoices.dueDate, today),
    ),
  });
  return !!overdue;
}

/** Thursday job: remind clients about unpaid invoices past their due date. */
export async function runPaymentReminders(now = new Date()) {
  const today = istDate(now);
  const due = await db
    .select()
    .from(schema.invoices)
    .where(and(eq(schema.invoices.status, "sent"), lt(schema.invoices.dueDate, today)));
  for (const inv of due) {
    await notify({ clientId: inv.clientId }, { event: "payment_reminder", title: `Payment reminder: ${inv.number} (${formatINR(inv.total)}) was due ${inv.dueDate}. New creatives are paused until it is cleared.`, href: `/portal/billing/${inv.id}` });
    await db.update(schema.invoices).set({ reminderSentAt: now }).where(eq(schema.invoices.id, inv.id));
  }
  return due.length;
}

export async function submitPaymentRef(user: User, invoiceId: string, ref: string) {
  const inv = await db.query.invoices.findFirst({ where: eq(schema.invoices.id, invoiceId) });
  if (!inv || (user.role === "client" && inv.clientId !== user.clientId)) throw new Error("Invoice not found.");
  if (inv.status === "paid" || inv.status === "void") throw new Error("This invoice is already closed.");
  if (!ref.trim()) throw new Error("Enter the UPI / bank reference (UTR).");
  await db.update(schema.invoices).set({ status: "payment_submitted", paymentRef: ref.trim(), paymentSubmittedAt: new Date() }).where(eq(schema.invoices.id, invoiceId));
  await audit({ userId: user.id, clientId: inv.clientId, entity: "invoice", entityId: invoiceId, action: "payment_submitted", before: { status: inv.status }, after: { status: "payment_submitted", paymentRef: ref.trim() } });
  await notify({ admins: true }, { event: "payment_submitted", title: `Payment reference submitted for ${inv.number}: ${ref.trim()}`, href: `/admin/billing/${inv.id}` });
}

export async function markInvoicePaid(user: User, invoiceId: string, ref: string | null) {
  if (user.role !== "admin") throw new Error("Admin only.");
  const inv = await db.query.invoices.findFirst({ where: eq(schema.invoices.id, invoiceId) });
  if (!inv) throw new Error("Invoice not found.");
  if (inv.status === "paid") return;
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.update(schema.invoices).set({ status: "paid", paidAt: now, paymentRef: ref?.trim() || inv.paymentRef }).where(eq(schema.invoices.id, invoiceId));
    await tx.update(schema.workItems).set({ status: "paid", updatedAt: now }).where(and(eq(schema.workItems.invoiceId, invoiceId), eq(schema.workItems.status, "billed")));
    await audit({ userId: user.id, clientId: inv.clientId, entity: "invoice", entityId: invoiceId, action: "mark_paid", before: { status: inv.status }, after: { status: "paid", paymentRef: ref } }, tx);
  });
  await notify({ clientId: inv.clientId }, { event: "payment_recorded", title: `Payment received for ${inv.number}. Thank you!`, href: `/portal/billing/${inv.id}` });
}

/** Void an unpaid invoice: its items and leads go back to the unbilled pool. */
export async function voidInvoice(user: User, invoiceId: string) {
  if (user.role !== "admin") throw new Error("Admin only.");
  const inv = await db.query.invoices.findFirst({ where: eq(schema.invoices.id, invoiceId) });
  if (!inv) throw new Error("Invoice not found.");
  if (inv.status === "paid") throw new Error("Paid invoices cannot be voided.");
  await db.transaction(async (tx) => {
    await tx.update(schema.workItems).set({ status: "accepted", invoiceId: null, updatedAt: new Date() }).where(eq(schema.workItems.invoiceId, invoiceId));
    await tx.update(schema.leads).set({ invoiceId: null }).where(eq(schema.leads.invoiceId, invoiceId));
    // Free the week so it can be regenerated; keep the number for the audit trail.
    await tx.update(schema.invoices).set({ status: "void", weekStart: `${inv.weekStart}#void-${inv.id.slice(0, 8)}` }).where(eq(schema.invoices.id, invoiceId));
    await audit({ userId: user.id, clientId: inv.clientId, entity: "invoice", entityId: invoiceId, action: "void", before: { status: inv.status } , after: { status: "void" } }, tx);
  });
}

/** Running outstanding balance per client: sum of unpaid, non-void invoices. */
export async function outstandingByClient(): Promise<Map<string, number>> {
  const rows = await db
    .select({ clientId: schema.invoices.clientId, total: sql<number>`coalesce(sum(${schema.invoices.total}),0)::int` })
    .from(schema.invoices)
    .where(inArray(schema.invoices.status, ["sent", "payment_submitted"]))
    .groupBy(schema.invoices.clientId);
  return new Map(rows.map((r) => [r.clientId, r.total]));
}
