import { and, asc, eq, gte, lte, ne, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { toCsv } from "@/lib/csv";
import { getSettings } from "@/lib/settings";
import { istDate, istInstant, weekContaining, addDays } from "@/lib/week";
import { STATUS_LABEL, TYPE_LABEL } from "@/lib/workflow";
import { LEAD_STATUS_LABEL, leadBillingLabel } from "@/lib/lead-rules";

/**
 * CSV exports (PRD §11): work items, leads and ledger, by client and date range.
 * Query: client=<id>, from=YYYY-MM-DD, to=YYYY-MM-DD, or week=<any date in week>.
 * Amounts are in rupees (two decimals). Client users can only export their own data.
 */
export async function GET(req: Request, ctx: RouteContext<"/api/export/[kind]">) {
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword) return new Response("Sign in first", { status: 401 });
  const { kind } = await ctx.params;
  const url = new URL(req.url);
  const clientId = user.role === "client" ? user.clientId! : url.searchParams.get("client") || undefined;
  const { cutoffHour } = await getSettings();
  let from: Date | undefined;
  let to: Date | undefined;
  const week = url.searchParams.get("week");
  if (week && /^\d{4}-\d{2}-\d{2}$/.test(week)) {
    const w = weekContaining(week, cutoffHour);
    from = w.previousCutoff;
    to = w.cutoff;
  } else {
    const f = url.searchParams.get("from");
    const t = url.searchParams.get("to");
    if (f && /^\d{4}-\d{2}-\d{2}$/.test(f)) from = istInstant(f);
    if (t && /^\d{4}-\d{2}-\d{2}$/.test(t)) to = istInstant(addDays(t, 1));
  }
  const rupees = (p: number) => (p / 100).toFixed(2);
  const clients = await db.select({ id: schema.clients.id, company: schema.clients.company }).from(schema.clients);
  const company = (id: string) => clients.find((c) => c.id === id)?.company ?? "";
  let rows: (string | number | null)[][] = [];

  if (kind === "work") {
    const conds: SQL[] = [];
    if (clientId) conds.push(eq(schema.workItems.clientId, clientId));
    if (from) conds.push(gte(schema.workItems.createdAt, from));
    if (to) conds.push(lte(schema.workItems.createdAt, to));
    const status = url.searchParams.get("status");
    if (status && status in STATUS_LABEL) conds.push(eq(schema.workItems.status, status as keyof typeof STATUS_LABEL));
    const items = await db.select().from(schema.workItems).where(and(...conds)).orderBy(asc(schema.workItems.number));
    rows = [["#", "Client", "Type", "Title", "Qty", "Rate (INR)", "Amount (INR)", "Status", "Created (IST)", "Admin approved", "Client approved", "Delivered", "Accepted", "Due date", "Invoice id"]];
    for (const i of items) {
      rows.push([i.number, company(i.clientId), TYPE_LABEL[i.type], i.title, i.qty, rupees(i.rate), rupees(i.amount), STATUS_LABEL[i.status], istDate(i.createdAt), i.adminApprovedAt?.toISOString() ?? "", i.clientApprovedAt?.toISOString() ?? "", i.deliveredAt?.toISOString() ?? "", i.acceptedAt?.toISOString() ?? "", i.dueDate ?? "", i.invoiceId ?? ""]);
    }
  } else if (kind === "leads") {
    const conds: SQL[] = [];
    if (clientId) conds.push(eq(schema.leads.clientId, clientId));
    if (from) conds.push(gte(schema.leads.receivedAt, from));
    if (to) conds.push(lte(schema.leads.receivedAt, to));
    const leads = await db.select().from(schema.leads).where(and(...conds)).orderBy(asc(schema.leads.receivedAt));
    const keys = [...new Set(leads.flatMap((l) => Object.keys(l.answers ?? {})))];
    rows = [["Received (IST)", "Client", "Name", "Phone", ...keys, "Status", "Duplicate", "Billing", "Invoice id"]];
    const now = new Date();
    for (const l of leads) {
      rows.push([new Date(l.receivedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }), company(l.clientId), l.name, l.phone, ...keys.map((k) => l.answers?.[k] ?? ""), LEAD_STATUS_LABEL[l.status], l.isDuplicate ? "yes" : "", l.invoiceId ? "Invoiced" : leadBillingLabel(l, now), l.invoiceId ?? ""]);
    }
  } else if (kind === "ledger") {
    const conds: SQL[] = [ne(schema.invoices.status, "void")];
    if (clientId) conds.push(eq(schema.invoices.clientId, clientId));
    if (from) conds.push(gte(schema.invoices.issuedAt, from));
    if (to) conds.push(lte(schema.invoices.issuedAt, to));
    const invs = await db.select().from(schema.invoices).where(and(...conds)).orderBy(asc(schema.invoices.issuedAt));
    rows = [["Invoice", "Client", "Week start", "Week end", "Line", "Qty", "Rate (INR)", "Amount (INR)", "Status", "Due", "Paid on", "Payment ref"]];
    let grand = 0;
    for (const inv of invs) {
      const lines = await db.select().from(schema.invoiceLines).where(eq(schema.invoiceLines.invoiceId, inv.id));
      for (const l of lines) rows.push([inv.number, company(inv.clientId), inv.weekStart, inv.weekEnd, l.description, l.qty, rupees(l.rate), rupees(l.amount), "", "", "", ""]);
      if (inv.tax) rows.push([inv.number, company(inv.clientId), inv.weekStart, inv.weekEnd, `GST ${inv.taxRateBps / 100}%`, "", "", rupees(inv.tax), "", "", "", ""]);
      rows.push([inv.number, company(inv.clientId), inv.weekStart, inv.weekEnd, "INVOICE TOTAL", "", "", rupees(inv.total), inv.status, inv.dueDate, inv.paidAt ? istDate(inv.paidAt) : "", inv.paymentRef ?? ""]);
      grand += inv.total;
    }
    rows.push(["", "", "", "", "GRAND TOTAL", "", "", rupees(grand), "", "", "", ""]);
  } else {
    return new Response("Unknown export", { status: 404 });
  }
  const name = `vault-${kind}-${clientId ? company(clientId).replace(/\W+/g, "-").toLowerCase() : "all"}-${istDate(new Date())}.csv`;
  return new Response(toCsv(rows), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" },
  });
}
