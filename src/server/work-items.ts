import "server-only";
import { and, eq, inArray, isNull, lte } from "drizzle-orm";
import { db, schema } from "@/db";
import type { User, WorkItem, WorkItemType } from "@/db/schema";
import * as wf from "@/lib/workflow";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { getSettings } from "@/lib/settings";
import { formatINR } from "@/lib/money";
import { getRateCard } from "./rate-cards";
import { clientIsBlockedByDocs } from "./documents";
import { clientHasOverdueInvoice } from "./billing";

/**
 * Work Item operations. Every function takes the acting user and enforces:
 *   - client data isolation (a client user may only touch its own client's items),
 *   - the state machine and dual-approval rules from src/lib/workflow.ts,
 *   - an audit-log entry with before/after and IP.
 */

type Role = wf.Role;

function roleOf(user: User): Role {
  return user.role;
}

async function load(user: User, id: string): Promise<WorkItem> {
  const item = await db.query.workItems.findFirst({ where: eq(schema.workItems.id, id) });
  if (!item) throw new wf.WorkflowError("Work item not found.");
  if (user.role === "client" && item.clientId !== user.clientId) {
    throw new wf.WorkflowError("Work item not found.");
  }
  return item;
}

const href = (item: { id: string }, role: Role) =>
  role === "admin" ? `/admin/work/${item.id}` : `/portal/work/${item.id}`;

function snapshot(i: WorkItem) {
  return {
    status: i.status,
    qty: i.qty,
    rate: i.rate,
    amount: i.amount,
    title: i.title,
    brief: i.brief,
    adminApprovedAt: i.adminApprovedAt,
    clientApprovedAt: i.clientApprovedAt,
  };
}

/** Notify the party that did NOT just act. */
async function notifyOther(
  actor: User,
  item: WorkItem,
  event: Parameters<typeof notify>[1]["event"],
  title: string,
) {
  if (actor.role === "admin") {
    await notify({ clientId: item.clientId }, { event, title, href: href(item, "client") });
  } else {
    await notify({ admins: true, clientId: null }, { event, title, href: href(item, "admin") });
  }
}

async function notifyBoth(item: WorkItem, event: Parameters<typeof notify>[1]["event"], title: string) {
  await notify({ admins: true }, { event, title, href: href(item, "admin") });
  await notify({ clientId: item.clientId }, { event, title, href: href(item, "client") });
}

export type CreateInput = {
  clientId: string;
  type: WorkItemType;
  title: string;
  brief?: string | null;
  qty: number;
  rate?: number | null; // admin only; clients always get the rate-card rate
  dueDate?: string | null;
  submit: boolean;
};

export async function createWorkItem(user: User, input: CreateInput): Promise<WorkItem> {
  const clientId = user.role === "client" ? user.clientId! : input.clientId;
  if (!clientId) throw new wf.WorkflowError("Choose a client.");
  if (input.qty < 1 || !Number.isInteger(input.qty)) throw new wf.WorkflowError("Quantity must be a whole number of at least 1.");
  if (!input.title.trim()) throw new wf.WorkflowError("Title is required.");

  if (await clientIsBlockedByDocs(clientId)) {
    throw new wf.WorkflowError(
      "New work is blocked until the Contract and SOW are accepted (see Documents).",
    );
  }
  if (user.role === "client" && (await clientHasOverdueInvoice(clientId))) {
    throw new wf.WorkflowError(
      "New creative requests are paused until the overdue invoice is cleared (see Billing).",
    );
  }

  const rc = await getRateCard(clientId);
  const rate =
    user.role === "admin" && input.rate !== null && input.rate !== undefined
      ? input.rate
      : wf.defaultRateFor(input.type, rc);
  const amount = rate * input.qty;
  const now = new Date();

  let state: wf.ApprovalState = { status: "draft", adminApprovedAt: null, clientApprovedAt: null };
  if (input.submit) {
    state = wf.submit(state, roleOf(user), now, { amount, autoSanctionLimit: rc.autoSanctionLimit });
  }

  const [item] = await db
    .insert(schema.workItems)
    .values({
      clientId,
      type: input.type,
      title: input.title.trim(),
      brief: input.brief?.trim() || null,
      qty: input.qty,
      rate,
      amount,
      dueDate: input.dueDate || null,
      createdBy: user.id,
      ...stampApprovals(state, user, now, null),
    })
    .returning();

  await audit({ userId: user.id, clientId, entity: "work_item", entityId: item.id, action: input.submit ? "create_and_submit" : "create_draft", after: snapshot(item) });
  await afterApprovalChange(user, item, "draft");
  return item;
}

/** Map an ApprovalState onto DB columns, recording who approved. */
function stampApprovals(
  s: wf.ApprovalState,
  user: User,
  now: Date,
  prev: WorkItem | null,
) {
  // Who approved: unchanged timestamp keeps the previous approver; a new timestamp belongs to the
  // acting user if it is their side, otherwise it came from auto-sanction (approver = null).
  const by = (ts: Date | null, prevTs: Date | null | undefined, prevBy: string | null | undefined, side: Role) => {
    if (!ts) return null;
    if (prevTs && prevTs.getTime() === ts.getTime()) return prevBy ?? null;
    return user.role === side ? user.id : null;
  };
  const out: Partial<WorkItem> = {
    status: s.status,
    adminApprovedAt: s.adminApprovedAt,
    clientApprovedAt: s.clientApprovedAt,
    adminApprovedBy: by(s.adminApprovedAt, prev?.adminApprovedAt, prev?.adminApprovedBy, "admin"),
    clientApprovedBy: by(s.clientApprovedAt, prev?.clientApprovedAt, prev?.clientApprovedBy, "client"),
    sanctionedAt: s.status === "sanctioned" ? (prev?.status === "sanctioned" ? prev.sanctionedAt : now) : null,
  };
  return out;
}

/** Notifications after a submit / approve / edit. */
async function afterApprovalChange(user: User, item: WorkItem, prevStatus: string) {
  if (item.status === "sanctioned" && prevStatus !== "sanctioned") {
    await notifyBoth(item, "item_sanctioned", `Sanctioned: ${item.title} (${formatINR(item.amount)})`);
  } else if (item.status === "proposed") {
    await notifyOther(user, item, "approval_needed", `Approval needed: ${item.title} (${formatINR(item.amount)})`);
  }
}

export async function submitWorkItem(user: User, id: string) {
  const item = await load(user, id);
  const rc = await getRateCard(item.clientId);
  const now = new Date();
  const next = wf.submit(item, roleOf(user), now, { amount: item.amount, autoSanctionLimit: rc.autoSanctionLimit });
  const [updated] = await db
    .update(schema.workItems)
    .set({ ...stampApprovals(next, user, now, item), updatedAt: now })
    .where(eq(schema.workItems.id, id))
    .returning();
  await audit({ userId: user.id, clientId: item.clientId, entity: "work_item", entityId: id, action: "submit", before: snapshot(item), after: snapshot(updated) });
  await afterApprovalChange(user, updated, item.status);
  return updated;
}

export async function approveWorkItem(
  user: User,
  id: string,
  seen?: { qty: number; rate: number; amount: number },
) {
  const item = await load(user, id);
  // The approver must be approving exactly the terms they saw on screen.
  if (seen && (seen.qty !== item.qty || seen.rate !== item.rate || seen.amount !== item.amount)) {
    throw new wf.WorkflowError("The quantity or rate changed since you opened this item. Review the new terms and approve again.");
  }
  const now = new Date();
  const next = wf.approve(item, roleOf(user), now);
  const [updated] = await db
    .update(schema.workItems)
    .set({ ...stampApprovals(next, user, now, item), updatedAt: now })
    // Optimistic concurrency: only apply if the terms being approved are unchanged since we read
    // them (status, qty, rate, amount, title) and this side has not approved yet. (Comparing
    // updatedAt is unreliable: Postgres keeps microseconds, JS Dates only milliseconds.)
    .where(
      and(
        eq(schema.workItems.id, id),
        eq(schema.workItems.status, item.status),
        eq(schema.workItems.qty, item.qty),
        eq(schema.workItems.rate, item.rate),
        eq(schema.workItems.amount, item.amount),
        eq(schema.workItems.title, item.title),
        isNull(user.role === "admin" ? schema.workItems.adminApprovedAt : schema.workItems.clientApprovedAt),
      ),
    )
    .returning();
  if (!updated) throw new wf.WorkflowError("This item changed while you were viewing it. Reload and review again.");
  await audit({ userId: user.id, clientId: item.clientId, entity: "work_item", entityId: id, action: "approve", before: snapshot(item), after: snapshot(updated) });
  await afterApprovalChange(user, updated, item.status);
  return updated;
}

export async function rejectWorkItem(user: User, id: string, reason: string) {
  const item = await load(user, id);
  if (!reason.trim()) throw new wf.WorkflowError("Give a reason for rejecting.");
  const next = wf.reject(item);
  const [updated] = await db
    .update(schema.workItems)
    .set({ status: next.status, rejectionReason: reason.trim(), updatedAt: new Date() })
    .where(eq(schema.workItems.id, id))
    .returning();
  await audit({ userId: user.id, clientId: item.clientId, entity: "work_item", entityId: id, action: "reject", before: snapshot(item), after: { ...snapshot(updated), reason } });
  await notifyOther(user, updated, "item_rejected", `Rejected: ${item.title} — ${reason.trim()}`);
  return updated;
}

export type EditInput = {
  title: string;
  brief: string | null;
  qty: number;
  rate: number | null; // ignored for clients
  dueDate: string | null;
};

/**
 * Edit an item. Changes to qty, rate, title or brief (scope) after submission reset approvals
 * (PRD §4). A due-date-only change does not.
 */
export async function editWorkItem(user: User, id: string, input: EditInput) {
  const item = await load(user, id);
  if (input.qty < 1 || !Number.isInteger(input.qty)) throw new wf.WorkflowError("Quantity must be a whole number of at least 1.");
  const rate = user.role === "admin" && input.rate !== null ? input.rate : item.rate;
  const termsChanged =
    input.qty !== item.qty ||
    rate !== item.rate ||
    input.title.trim() !== item.title ||
    (input.brief?.trim() || null) !== (item.brief ?? null);
  const now = new Date();
  let patch: Partial<WorkItem> = { dueDate: input.dueDate || null, updatedAt: now };
  if (termsChanged) {
    const next = wf.editTerms(item, roleOf(user), now);
    patch = {
      ...patch,
      title: input.title.trim(),
      brief: input.brief?.trim() || null,
      qty: input.qty,
      rate,
      amount: rate * input.qty,
      ...stampApprovals(next, user, now, null),
    };
  } else if (!wf.EDITABLE.includes(item.status)) {
    throw new wf.WorkflowError("This item can no longer be edited.");
  }
  const [updated] = await db.update(schema.workItems).set(patch).where(eq(schema.workItems.id, id)).returning();
  await audit({ userId: user.id, clientId: item.clientId, entity: "work_item", entityId: id, action: termsChanged ? "edit_terms_reset_approvals" : "edit", before: snapshot(item), after: snapshot(updated) });
  if (termsChanged && item.status !== "draft") {
    // Re-notify both parties (PRD §4 rule 2).
    await notifyBoth(updated, "approval_needed", `Changed, re-approval needed: ${updated.title} (${formatINR(updated.amount)})`);
  }
  return updated;
}

export async function transitionWorkItem(user: User, id: string, to: WorkItem["status"]) {
  const item = await load(user, id);
  wf.assertTransition(item.status, to, roleOf(user));
  const now = new Date();
  const patch: Partial<WorkItem> = { status: to, updatedAt: now };
  if (to === "delivered") {
    const deliverables = await db.query.attachments.findFirst({
      where: and(eq(schema.attachments.workItemId, id), eq(schema.attachments.kind, "deliverable")),
    });
    if (!deliverables && item.type !== "lead_batch") {
      throw new wf.WorkflowError("Upload the final file or link before marking it delivered.");
    }
    patch.deliveredAt = now;
  }
  if (to === "accepted") patch.acceptedAt = now;
  const [updated] = await db.update(schema.workItems).set(patch).where(eq(schema.workItems.id, id)).returning();
  await audit({ userId: user.id, clientId: item.clientId, entity: "work_item", entityId: id, action: `status:${to}`, before: snapshot(item), after: snapshot(updated) });
  if (to === "delivered") await notifyOther(user, updated, "delivery_uploaded", `Delivered for review: ${item.title}`);
  if (to === "accepted") await notifyOther(user, updated, "item_accepted", `Accepted: ${item.title}`);
  if (to === "cancelled") await notifyOther(user, updated, "item_rejected", `Cancelled: ${item.title}`);
  return updated;
}

/**
 * Client asks for a revision on a delivered creative. Free revisions are counted per item;
 * beyond the free limit, a paid "Extra revision" Work Item is proposed (client's request counts
 * as the client approval; Admin must approve it like any other item).
 */
export async function requestRevision(user: User, id: string, note: string) {
  const item = await load(user, id);
  wf.assertTransition(item.status, "revision_requested", roleOf(user));
  if (!note.trim()) throw new wf.WorkflowError("Describe what should change.");
  const rc = await getRateCard(item.clientId);
  const free = wf.revisionIsFree(item.revisionCount, rc.freeRevisions);
  const now = new Date();
  const [updated] = await db
    .update(schema.workItems)
    .set({ status: "revision_requested", revisionCount: item.revisionCount + 1, updatedAt: now })
    .where(eq(schema.workItems.id, id))
    .returning();
  await db.insert(schema.comments).values({
    clientId: item.clientId,
    workItemId: id,
    userId: user.id,
    text: `Revision ${item.revisionCount + 1}${free ? " (free)" : " (paid)"} requested: ${note.trim()}`,
  });
  let paidItem: WorkItem | null = null;
  if (!free) {
    [paidItem] = await db
      .insert(schema.workItems)
      .values({
        clientId: item.clientId,
        type: "revision",
        title: `Extra revision ${item.revisionCount + 1} — ${item.title}`,
        brief: note.trim(),
        qty: 1,
        rate: rc.revisionRate,
        amount: rc.revisionRate,
        status: "proposed",
        createdBy: user.id,
        clientApprovedAt: now,
        clientApprovedBy: user.id,
        parentId: item.id,
      })
      .returning();
  }
  await audit({ userId: user.id, clientId: item.clientId, entity: "work_item", entityId: id, action: "revision_requested", before: snapshot(item), after: { ...snapshot(updated), free, paidItemId: paidItem?.id ?? null } });
  await notifyOther(user, updated, "revision_requested", `Revision requested${free ? "" : " (paid)"}: ${item.title}`);
  return { updated, paidItem };
}

export async function addComment(user: User, id: string, text: string) {
  const item = await load(user, id);
  if (!text.trim()) throw new wf.WorkflowError("Comment is empty.");
  await db.insert(schema.comments).values({ clientId: item.clientId, workItemId: id, userId: user.id, text: text.trim() });
  await notifyOther(user, item, "comment", `New comment on ${item.title}`);
}

export async function addAttachment(
  user: User,
  id: string,
  att: { kind: "brief" | "deliverable"; storageKey?: string; url?: string; fileName?: string; mimeType?: string; sizeBytes?: number },
) {
  const item = await load(user, id);
  if (att.kind === "deliverable" && user.role !== "admin") throw new wf.WorkflowError("Only Admin uploads deliverables.");
  await db.insert(schema.attachments).values({
    clientId: item.clientId,
    workItemId: id,
    kind: att.kind,
    storageKey: att.storageKey ?? null,
    url: att.url ?? null,
    fileName: att.fileName ?? null,
    mimeType: att.mimeType ?? null,
    sizeBytes: att.sizeBytes ?? null,
    uploadedBy: user.id,
  });
  await audit({ userId: user.id, clientId: item.clientId, entity: "work_item", entityId: id, action: `attach:${att.kind}`, after: { fileName: att.fileName, url: att.url } });
}

/**
 * Auto-accept deliveries after the configured silence window (PRD §4 step 6). Runs from the
 * cron endpoint, before invoice generation, and lazily on dashboard loads.
 */
export async function runAutoAccept(now = new Date()): Promise<number> {
  const { autoAcceptHours } = await getSettings();
  if (autoAcceptHours <= 0) return 0;
  const threshold = new Date(now.getTime() - autoAcceptHours * 3_600_000);
  const due = await db
    .select()
    .from(schema.workItems)
    .where(and(eq(schema.workItems.status, "delivered"), lte(schema.workItems.deliveredAt, threshold)));
  for (const item of due) {
    // Accepted at the moment the window closed, so it lands in the right billing week.
    const acceptedAt = new Date(item.deliveredAt!.getTime() + autoAcceptHours * 3_600_000);
    await db
      .update(schema.workItems)
      .set({ status: "accepted", acceptedAt, autoAccepted: true, updatedAt: now })
      .where(and(eq(schema.workItems.id, item.id), eq(schema.workItems.status, "delivered")));
    await audit({ userId: null, clientId: item.clientId, entity: "work_item", entityId: item.id, action: "auto_accept", before: snapshot(item), after: { status: "accepted", acceptedAt } });
    await notifyBoth({ ...item, status: "accepted" }, "item_accepted", `Auto-accepted after ${autoAcceptHours} h: ${item.title}`);
  }
  return due.length;
}

/** Items not yet on an invoice that are accepted — used by billing previews. */
export async function unbilledAccepted(clientId: string, upTo: Date) {
  return db
    .select()
    .from(schema.workItems)
    .where(
      and(
        eq(schema.workItems.clientId, clientId),
        eq(schema.workItems.status, "accepted"),
        isNull(schema.workItems.invoiceId),
        lte(schema.workItems.acceptedAt, upTo),
      ),
    );
}

export async function bulkTransition(user: User, ids: string[], to: WorkItem["status"] | "approve") {
  const results: { id: string; ok: boolean; error?: string }[] = [];
  const items = await db.select().from(schema.workItems).where(inArray(schema.workItems.id, ids));
  for (const it of items) {
    try {
      if (to === "approve") await approveWorkItem(user, it.id);
      else await transitionWorkItem(user, it.id, to);
      results.push({ id: it.id, ok: true });
    } catch (e) {
      results.push({ id: it.id, ok: false, error: (e as Error).message });
    }
  }
  return results;
}
