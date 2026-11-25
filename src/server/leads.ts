import "server-only";
import { and, eq, gt, isNull, lt, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Lead, LeadStatus, User } from "@/db/schema";
import { DUPLICATE_WINDOW_DAYS, LEAD_STATUS_LABEL, normalizePhone } from "@/lib/lead-rules";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { getSettings } from "@/lib/settings";

/**
 * Lead intake and client feedback (PRD §2.2, §5 Leads, §6 My Leads).
 */

export type LeadInput = {
  name?: string | null;
  phone?: string | null;
  answers?: Record<string, string>;
  receivedAt?: Date;
  source?: string;
  replacesId?: string | null;
  workItemId?: string | null;
};

/** Is there an earlier lead for this client with the same phone in the last 30 days? */
async function findDuplicate(clientId: string, phoneNormalized: string | null, receivedAt: Date) {
  if (!phoneNormalized) return null;
  const since = new Date(receivedAt.getTime() - DUPLICATE_WINDOW_DAYS * 86_400_000);
  return db.query.leads.findFirst({
    where: and(
      eq(schema.leads.clientId, clientId),
      eq(schema.leads.phoneNormalized, phoneNormalized),
      gt(schema.leads.receivedAt, since),
    ),
  });
}

export async function addLeads(
  actor: User | null,
  clientId: string,
  inputs: LeadInput[],
  opts: { notifyClient?: boolean } = { notifyClient: true },
) {
  const created: Lead[] = [];
  for (const input of inputs) {
    const receivedAt = input.receivedAt ?? new Date();
    const phoneNormalized = normalizePhone(input.phone);
    const dup = await findDuplicate(clientId, phoneNormalized, receivedAt);
    // Re-importing the same export must not create copies: same phone + same timestamp = same lead.
    if (dup && input.receivedAt && dup.receivedAt.getTime() === receivedAt.getTime()) continue;
    const [lead] = await db
      .insert(schema.leads)
      .values({
        clientId,
        name: input.name?.trim() || null,
        phone: input.phone?.trim() || null,
        phoneNormalized,
        answers: input.answers ?? {},
        source: input.source ?? "manual",
        receivedAt,
        isDuplicate: !!dup,
        duplicateOf: dup?.id ?? null,
        replacesId: input.replacesId ?? null,
        workItemId: input.workItemId ?? null,
      })
      .returning();
    if (input.replacesId) {
      await db
        .update(schema.leads)
        .set({ replacedBy: lead.id })
        .where(and(eq(schema.leads.id, input.replacesId), eq(schema.leads.clientId, clientId)));
    }
    created.push(lead);
  }
  if (created.length) {
    await audit({ userId: actor?.id ?? null, clientId, entity: "lead", action: "import", after: { count: created.length, source: inputs[0]?.source ?? "manual" } });
    if (opts.notifyClient !== false) {
      await notify(
        { clientId },
        { event: "new_leads", title: `${created.length} new lead${created.length > 1 ? "s" : ""} received`, href: "/portal/leads" },
      );
    }
  }
  return created;
}

/** Client (or admin) records feedback on a lead. */
export async function setLeadStatus(user: User, leadId: string, status: LeadStatus) {
  const lead = await db.query.leads.findFirst({ where: eq(schema.leads.id, leadId) });
  if (!lead || (user.role === "client" && lead.clientId !== user.clientId)) throw new Error("Lead not found.");
  if (lead.invoiceId) throw new Error("This lead is already on an invoice and can no longer change.");
  const now = new Date();
  await db.update(schema.leads).set({ status, statusChangedAt: now }).where(eq(schema.leads.id, leadId));
  await audit({ userId: user.id, clientId: lead.clientId, entity: "lead", entityId: leadId, action: "status", before: { status: lead.status }, after: { status } });
  if (user.role === "client" && (status === "fake" || status === "wrong_number")) {
    await notify({ admins: true }, { event: "new_leads", title: `Lead marked ${LEAD_STATUS_LABEL[status]}: ${lead.name ?? lead.phone}`, href: `/admin/leads?client=${lead.clientId}` });
  }
}

/** Admin override for duplicate flag (e.g. same phone but genuinely new enquiry). */
export async function setLeadDuplicate(user: User, leadId: string, isDuplicate: boolean) {
  if (user.role !== "admin") throw new Error("Admin only.");
  const lead = await db.query.leads.findFirst({ where: eq(schema.leads.id, leadId) });
  if (!lead) throw new Error("Lead not found.");
  if (lead.invoiceId) throw new Error("Already invoiced.");
  await db.update(schema.leads).set({ isDuplicate }).where(eq(schema.leads.id, leadId));
  await audit({ userId: user.id, clientId: lead.clientId, entity: "lead", entityId: leadId, action: "duplicate_flag", before: { isDuplicate: lead.isDuplicate }, after: { isDuplicate } });
}

/** Delete a lead's personal data on request (PRD §12). Invoiced leads keep a stub row for the ledger. */
export async function eraseLead(user: User, leadId: string) {
  if (user.role !== "admin") throw new Error("Admin only.");
  const lead = await db.query.leads.findFirst({ where: eq(schema.leads.id, leadId) });
  if (!lead) throw new Error("Lead not found.");
  if (lead.invoiceId) {
    await db
      .update(schema.leads)
      .set({ name: "[erased]", phone: null, phoneNormalized: null, answers: {} })
      .where(eq(schema.leads.id, leadId));
  } else {
    await db.update(schema.leads).set({ replacedBy: null }).where(eq(schema.leads.replacedBy, leadId));
    await db.delete(schema.leads).where(eq(schema.leads.id, leadId));
  }
  await audit({ userId: user.id, clientId: lead.clientId, entity: "lead", entityId: leadId, action: "erase_personal_data" });
}

/**
 * Retention (DPA: personal data kept for 12 months by default). Anonymises leads received more than
 * `leadRetentionMonths` ago: name, phone and answers are removed, the row stays so invoices, reports and
 * counts still add up. Runs from the daily job; idempotent (D-020).
 */
export async function runLeadRetention(now = new Date()): Promise<number> {
  const { leadRetentionMonths } = await getSettings();
  if (!leadRetentionMonths || leadRetentionMonths <= 0) return 0;
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - leadRetentionMonths);
  const erased = await db
    .update(schema.leads)
    .set({ name: "[erased]", phone: null, phoneNormalized: null, answers: {} })
    .where(and(lt(schema.leads.receivedAt, cutoff), sql`coalesce(${schema.leads.name}, '') <> '[erased]'`))
    .returning({ id: schema.leads.id });
  if (erased.length) {
    await audit({ userId: null, entity: "lead", action: "retention_erase", after: { count: erased.length, olderThan: cutoff.toISOString(), months: leadRetentionMonths } });
  }
  return erased.length;
}

/** Leads not yet invoiced for a client. */
export async function unbilledLeads(clientId: string) {
  return db.select().from(schema.leads).where(and(eq(schema.leads.clientId, clientId), isNull(schema.leads.invoiceId)));
}

// ---------------------------------------------------------------------------
// CSV parsing for Meta lead-form exports and generic sheets
// ---------------------------------------------------------------------------

/** Minimal RFC-4180 CSV parser (handles quotes, commas and newlines inside quotes). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const src = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === "," || c === "\t") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}

const NAME_KEYS = ["full_name", "name", "full name", "customer name", "lead name"];
const PHONE_KEYS = ["phone_number", "phone", "mobile", "phone number", "mobile number", "contact", "whatsapp"];
const TIME_KEYS = ["created_time", "created", "date", "timestamp", "received", "received_at"];
/** Meta export metadata columns that are not form answers. */
const META_KEYS = ["id", "ad_id", "ad_name", "adset_id", "adset_name", "campaign_id", "campaign_name", "form_id", "form_name", "is_organic", "platform", "lead_status", "email"];

/** Map CSV rows (first row = headers) to lead inputs. Unknown columns become form answers. */
export function csvToLeads(text: string): { leads: LeadInput[]; headers: string[] } {
  const rows = parseCsv(text);
  if (rows.length < 2) return { leads: [], headers: rows[0] ?? [] };
  const headers = rows[0].map((h) => h.trim());
  const lower = headers.map((h) => h.toLowerCase());
  const find = (keys: string[]) => lower.findIndex((h) => keys.includes(h));
  const iName = find(NAME_KEYS);
  const iPhone = find(PHONE_KEYS);
  const iTime = find(TIME_KEYS);
  const leads = rows.slice(1).map((r) => {
    const answers: Record<string, string> = {};
    headers.forEach((h, i) => {
      if (i === iName || i === iPhone || i === iTime) return;
      if (META_KEYS.includes(lower[i])) return;
      const v = (r[i] ?? "").trim();
      if (v) answers[h.replace(/_/g, " ")] = v;
    });
    const t = iTime >= 0 ? new Date(r[iTime]) : null;
    return {
      name: iName >= 0 ? r[iName] : null,
      phone: iPhone >= 0 ? r[iPhone].replace(/^p:/, "") : null,
      answers,
      receivedAt: t && !Number.isNaN(t.getTime()) ? t : undefined,
      source: "csv",
    } satisfies LeadInput;
  });
  return { leads, headers };
}
