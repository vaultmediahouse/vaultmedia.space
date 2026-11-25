import "server-only";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Document, DocType, User } from "@/db/schema";
import { DOC_TYPE_LABEL, GATING_DOCS, REQUIRED_DOCS, renderTemplate } from "@/lib/templates";
import { randomToken } from "@/lib/crypto";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { getSettings } from "@/lib/settings";
import { formatINR } from "@/lib/money";
import { formatISTDate, istDate } from "@/lib/week";
import { getRateCard } from "./rate-cards";

/**
 * Document Manager (PRD §7).
 * Lifecycle: draft → sent → viewed → accepted (locked) | expired | archived.
 * Versioning: all versions share groupId; editing an accepted (locked) document creates a new
 * draft version, and the old one keeps its acceptance record forever.
 */

export async function templateVariables(clientId: string, extra: Record<string, string> = {}) {
  const s = await getSettings();
  const rc = await getRateCard(clientId);
  const client = await db.query.clients.findFirst({ where: eq(schema.clients.id, clientId) });
  if (!client) throw new Error("Client not found.");
  const today = formatISTDate(new Date());
  return {
    agency_name: s.businessName,
    agency_address: s.businessAddress,
    agency_gstin: s.gstin || "N/A",
    client_name: client.company,
    client_contact: client.contactName ?? "",
    client_address: [client.address, client.city].filter(Boolean).join(", "),
    client_gst: client.gstNo || "N/A",
    start_date: today,
    today,
    rate_image: formatINR(rc.imageRate),
    rate_video: formatINR(rc.videoRate),
    lead_rate: formatINR(rc.leadRate),
    revision_rate: formatINR(rc.revisionRate),
    setup_fee: formatINR(rc.setupFee),
    free_revisions: String(rc.freeRevisions),
    max_video_seconds: String(rc.maxVideoSeconds),
    payment_window_days: String(s.paymentWindowDays),
    cutoff_time: `Sunday ${s.cutoffHour % 12 || 12}:00 ${s.cutoffHour >= 12 ? "PM" : "AM"} IST`,
    auto_accept_hours: String(s.autoAcceptHours),
    jurisdiction: s.jurisdiction,
    upi_id: s.upiId,
    bank_details: s.bankDetails,
    ...extra,
  } as Record<string, string>;
}

function loadFor(user: User, doc: Document | undefined): Document {
  if (!doc) throw new Error("Document not found.");
  if (user.role === "client") {
    if (doc.clientId !== user.clientId || doc.status === "draft" || doc.status === "archived") {
      throw new Error("Document not found.");
    }
  }
  return doc;
}

export async function createFromTemplate(
  user: User,
  clientId: string,
  templateId: string,
  extra: Record<string, string> = {},
) {
  if (user.role !== "admin") throw new Error("Admin only.");
  const tpl = await db.query.docTemplates.findFirst({ where: eq(schema.docTemplates.id, templateId) });
  if (!tpl) throw new Error("Template not found.");
  const vars = await templateVariables(clientId, extra);
  const groupId = crypto.randomUUID();
  const [doc] = await db
    .insert(schema.documents)
    .values({
      clientId,
      groupId,
      type: tpl.type,
      title: `${tpl.name} — ${vars.client_name}`,
      content: renderTemplate(tpl.body, vars),
      status: "draft",
      shareToken: randomToken(24),
      templateId: tpl.id,
    })
    .returning();
  await audit({ userId: user.id, clientId, entity: "document", entityId: doc.id, action: "create", after: { type: doc.type, title: doc.title } });
  return doc;
}

export async function createBlank(user: User, clientId: string, type: DocType, title: string, content: string) {
  if (user.role !== "admin") throw new Error("Admin only.");
  const [doc] = await db
    .insert(schema.documents)
    .values({ clientId, groupId: crypto.randomUUID(), type, title, content, status: "draft", shareToken: randomToken(24) })
    .returning();
  await audit({ userId: user.id, clientId, entity: "document", entityId: doc.id, action: "create", after: { type, title } });
  return doc;
}

/**
 * Save edits. A draft is edited in place. A sent/viewed doc is edited in place too, but drops back
 * to draft so it must be re-sent. An accepted doc is locked: saving creates a new version.
 */
export async function saveDocument(user: User, id: string, title: string, content: string) {
  if (user.role !== "admin") throw new Error("Admin only.");
  const doc = await db.query.documents.findFirst({ where: eq(schema.documents.id, id) });
  if (!doc) throw new Error("Document not found.");
  if (doc.supersededBy) throw new Error("This is an old version. Open the latest version to edit.");
  if (doc.status === "accepted") {
    const [next] = await db
      .insert(schema.documents)
      .values({
        clientId: doc.clientId,
        groupId: doc.groupId,
        type: doc.type,
        title,
        version: doc.version + 1,
        content,
        status: "draft",
        shareToken: randomToken(24),
        templateId: doc.templateId,
      })
      .returning();
    await db.update(schema.documents).set({ supersededBy: next.id }).where(eq(schema.documents.id, doc.id));
    await audit({ userId: user.id, clientId: doc.clientId, entity: "document", entityId: next.id, action: "new_version", before: { id: doc.id, version: doc.version }, after: { version: next.version } });
    return next;
  }
  const [updated] = await db
    .update(schema.documents)
    .set({ title, content, status: "draft", sentAt: null, viewedAt: null, updatedAt: new Date() })
    .where(eq(schema.documents.id, id))
    .returning();
  await audit({ userId: user.id, clientId: doc.clientId, entity: "document", entityId: id, action: "edit", before: { status: doc.status }, after: { status: "draft" } });
  return updated;
}

export async function sendDocument(user: User, id: string, expiresAt: string | null) {
  if (user.role !== "admin") throw new Error("Admin only.");
  const doc = await db.query.documents.findFirst({ where: eq(schema.documents.id, id) });
  if (!doc) throw new Error("Document not found.");
  if (doc.status === "accepted") throw new Error("Already accepted.");
  if (doc.supersededBy) throw new Error("This is an old version.");
  if (/\{\{\s*[a-z_]+\s*\}\}/.test(doc.content)) {
    throw new Error("Fill in the remaining {{variables}} before sending (check Settings for agency details).");
  }
  const [updated] = await db
    .update(schema.documents)
    .set({ status: "sent", sentAt: new Date(), expiresAt: expiresAt || null, updatedAt: new Date() })
    .where(eq(schema.documents.id, id))
    .returning();
  await audit({ userId: user.id, clientId: doc.clientId, entity: "document", entityId: id, action: "send" });
  await notify({ clientId: doc.clientId }, { event: "document_sent", title: `Please review: ${doc.title}`, href: `/portal/documents/${doc.id}` });
  return updated;
}

/** Called when a client opens the document. First open records Viewed. */
export async function markViewed(user: User, id: string) {
  const doc = loadFor(user, await db.query.documents.findFirst({ where: eq(schema.documents.id, id) }));
  if (user.role !== "client") return doc;
  await expireIfNeeded(doc);
  if (doc.status === "sent") {
    const [updated] = await db
      .update(schema.documents)
      .set({ status: "viewed", viewedAt: new Date() })
      .where(and(eq(schema.documents.id, id), eq(schema.documents.status, "sent")))
      .returning();
    if (updated) {
      await audit({ userId: user.id, clientId: doc.clientId, entity: "document", entityId: id, action: "viewed" });
      await notify({ admins: true }, { event: "document_viewed", title: `Viewed: ${doc.title}`, href: `/admin/documents/${doc.id}` });
      return updated;
    }
  }
  return doc;
}

async function expireIfNeeded(doc: Document) {
  if (doc.expiresAt && ["sent", "viewed"].includes(doc.status) && doc.expiresAt < istDate(new Date())) {
    await db.update(schema.documents).set({ status: "expired" }).where(eq(schema.documents.id, doc.id));
    doc.status = "expired";
  }
}

/** Client e-acceptance: checkbox + typed name; records timestamp and IP, then locks the doc. */
export async function acceptDocument(
  user: User,
  id: string,
  input: { typedName: string; agreed: boolean; ip: string; signedStorageKey?: string | null },
) {
  if (user.role !== "client") throw new Error("Only the client can accept a document.");
  const doc = loadFor(user, await db.query.documents.findFirst({ where: eq(schema.documents.id, id) }));
  await expireIfNeeded(doc);
  if (!["sent", "viewed"].includes(doc.status)) throw new Error(`This document is ${doc.status} and cannot be accepted.`);
  if (!input.agreed) throw new Error("Tick the box to confirm you agree.");
  if (input.typedName.trim().length < 3) throw new Error("Type your full name to sign.");
  const now = new Date();
  const [updated] = await db
    .update(schema.documents)
    .set({
      status: "accepted",
      viewedAt: doc.viewedAt ?? now,
      acceptedAt: now,
      acceptedIp: input.ip,
      acceptedName: input.typedName.trim(),
      acceptedBy: user.id,
      signedStorageKey: input.signedStorageKey ?? null,
    })
    .where(and(eq(schema.documents.id, id), inArray(schema.documents.status, ["sent", "viewed"])))
    .returning();
  if (!updated) throw new Error("This document changed. Reload the page.");
  await audit({ userId: user.id, clientId: doc.clientId, entity: "document", entityId: id, action: "accept", after: { typedName: input.typedName.trim(), ip: input.ip, at: now.toISOString() } });
  await notify({ admins: true }, { event: "document_accepted", title: `Accepted: ${doc.title} by ${input.typedName.trim()}`, href: `/admin/documents/${doc.id}` });
  return updated;
}

export async function archiveDocument(user: User, id: string) {
  if (user.role !== "admin") throw new Error("Admin only.");
  await db.update(schema.documents).set({ status: "archived" }).where(eq(schema.documents.id, id));
  await audit({ userId: user.id, entity: "document", entityId: id, action: "archive" });
}

/** Latest version of each document group for a client. */
export async function latestDocuments(clientId: string) {
  return db
    .select()
    .from(schema.documents)
    .where(and(eq(schema.documents.clientId, clientId), isNull(schema.documents.supersededBy)))
    .orderBy(desc(schema.documents.createdAt));
}

/** Required-docs checklist (PRD §7): has each required type been accepted (any version)? */
export async function requiredDocsStatus(clientId: string) {
  const docs = await db
    .select({ type: schema.documents.type, status: schema.documents.status })
    .from(schema.documents)
    .where(eq(schema.documents.clientId, clientId));
  return REQUIRED_DOCS.map((type) => {
    const ofType = docs.filter((d) => d.type === type);
    const state = ofType.some((d) => d.status === "accepted")
      ? "accepted"
      : ofType.some((d) => d.status === "sent" || d.status === "viewed")
        ? "sent"
        : ofType.length
          ? "draft"
          : "missing";
    return { type, label: DOC_TYPE_LABEL[type], state };
  });
}

export async function clientIsBlockedByDocs(clientId: string): Promise<boolean> {
  const client = await db.query.clients.findFirst({ where: eq(schema.clients.id, clientId) });
  if (!client?.requireDocsBeforeWork) return false;
  const status = await requiredDocsStatus(clientId);
  return GATING_DOCS.some((t) => status.find((s) => s.type === t)?.state !== "accepted");
}
