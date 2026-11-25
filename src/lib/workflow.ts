/**
 * Work Item state machine and dual-approval rules (PRD §4). Pure functions: no database access,
 * so the rules are unit-tested in tests/workflow.test.ts.
 *
 *   draft → proposed → sanctioned → in_progress → delivered → accepted → billed → paid
 *                                         ↑            │
 *                                         └─ revision_requested
 *   side states: rejected, cancelled
 *
 * The gate: an item reaches `sanctioned` only when BOTH adminApprovedAt and clientApprovedAt
 * are set. Editing qty / rate / scope after proposal clears the other party's approval and
 * drops the item back to `proposed`.
 */
import type { WorkItemStatus, WorkItemType } from "@/db/schema";

export type Role = "admin" | "client";

export type ApprovalState = {
  status: WorkItemStatus;
  adminApprovedAt: Date | null;
  clientApprovedAt: Date | null;
};

export const STATUS_LABEL: Record<WorkItemStatus, string> = {
  draft: "Draft",
  proposed: "Proposed",
  sanctioned: "Sanctioned",
  in_progress: "In Progress",
  delivered: "Delivered",
  revision_requested: "Revision Requested",
  accepted: "Accepted",
  billed: "Billed",
  paid: "Paid",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

export const TYPE_LABEL: Record<WorkItemType, string> = {
  image: "Image creative",
  video: "Video creative",
  lead_batch: "Lead batch",
  revision: "Extra revision",
  other: "Other",
};

/** Board columns, in order, for the kanban view. */
export const BOARD_COLUMNS: WorkItemStatus[] = [
  "draft",
  "proposed",
  "sanctioned",
  "in_progress",
  "revision_requested",
  "delivered",
  "accepted",
  "billed",
  "paid",
];

export class WorkflowError extends Error {}

function approvalField(role: Role): "adminApprovedAt" | "clientApprovedAt" {
  return role === "admin" ? "adminApprovedAt" : "clientApprovedAt";
}

/**
 * Submitting a draft. The creator's submission counts as their approval (PRD §4 rule 1).
 * If the item is below the client's auto-sanction limit, it is sanctioned immediately.
 */
export function submit(
  s: ApprovalState,
  role: Role,
  now: Date,
  opts: { amount: number; autoSanctionLimit: number },
): ApprovalState {
  if (s.status !== "draft") throw new WorkflowError("Only drafts can be submitted.");
  const next: ApprovalState = { ...s, status: "proposed", [approvalField(role)]: now };
  if (opts.autoSanctionLimit > 0 && opts.amount < opts.autoSanctionLimit) {
    next.adminApprovedAt ??= now;
    next.clientApprovedAt ??= now;
  }
  return settle(next);
}

/** The other party approves a proposed item. */
export function approve(s: ApprovalState, role: Role, now: Date): ApprovalState {
  if (s.status !== "proposed") throw new WorkflowError("Only proposed items can be approved.");
  if (s[approvalField(role)]) throw new WorkflowError("You have already approved this item.");
  return settle({ ...s, [approvalField(role)]: now });
}

/** Moves a proposed item to sanctioned once both approvals exist. */
export function settle(s: ApprovalState): ApprovalState {
  if (s.status === "proposed" && s.adminApprovedAt && s.clientApprovedAt) {
    return { ...s, status: "sanctioned" };
  }
  return s;
}

export function reject(s: ApprovalState): ApprovalState {
  if (s.status !== "proposed") throw new WorkflowError("Only proposed items can be rejected.");
  return { ...s, status: "rejected" };
}

/** Statuses in which qty / rate / scope may still be edited. */
export const EDITABLE: WorkItemStatus[] = ["draft", "proposed", "sanctioned", "in_progress"];

/**
 * An edit to quantity, rate or scope. Before submission nothing changes. After submission,
 * approvals reset: the editor's approval is re-stamped and the other party must approve again
 * (PRD §4 rule 2), so a sanctioned or in-progress item drops back to `proposed`.
 */
export function editTerms(s: ApprovalState, role: Role, now: Date): ApprovalState {
  if (!EDITABLE.includes(s.status)) {
    throw new WorkflowError("This item can no longer be edited.");
  }
  if (s.status === "draft") return s;
  return {
    status: "proposed",
    adminApprovedAt: role === "admin" ? now : null,
    clientApprovedAt: role === "client" ? now : null,
  };
}

/** Allowed one-step transitions outside the approval logic, and who may make them. */
const TRANSITIONS: Partial<Record<WorkItemStatus, Partial<Record<WorkItemStatus, Role[]>>>> = {
  sanctioned: { in_progress: ["admin"], cancelled: ["admin", "client"] },
  in_progress: { delivered: ["admin"], cancelled: ["admin"] },
  revision_requested: { in_progress: ["admin"], delivered: ["admin"] },
  delivered: { accepted: ["client"], revision_requested: ["client"] },
  draft: { cancelled: ["admin", "client"] },
  proposed: { cancelled: ["admin", "client"] },
  accepted: { billed: ["admin"] },
  billed: { paid: ["admin"] },
};

export function canTransition(from: WorkItemStatus, to: WorkItemStatus, role: Role): boolean {
  return TRANSITIONS[from]?.[to]?.includes(role) ?? false;
}

export function assertTransition(from: WorkItemStatus, to: WorkItemStatus, role: Role) {
  if (!canTransition(from, to, role)) {
    throw new WorkflowError(
      `Cannot move from ${STATUS_LABEL[from]} to ${STATUS_LABEL[to]} as ${role}.`,
    );
  }
}

/** Whether a revision request is free or must be charged (PRD §2.1 rows 1, 2, 4). */
export function revisionIsFree(revisionCountSoFar: number, freeRevisions: number): boolean {
  return revisionCountSoFar < freeRevisions;
}

/** Should a delivered item be auto-accepted? (PRD §4 step 6; window 0 disables it.) */
export function shouldAutoAccept(
  deliveredAt: Date | null,
  now: Date,
  autoAcceptHours: number,
): boolean {
  if (!deliveredAt || autoAcceptHours <= 0) return false;
  return now.getTime() - deliveredAt.getTime() >= autoAcceptHours * 3_600_000;
}

/** What the given role still needs to do on this item, for the "waiting for me" lists. */
export function needsActionFrom(
  s: ApprovalState & { createdByRole?: Role },
  role: Role,
): boolean {
  if (s.status === "proposed") return !s[approvalField(role)];
  if (role === "client") return s.status === "delivered";
  return s.status === "sanctioned" || s.status === "revision_requested";
}

export function defaultRateFor(
  type: WorkItemType,
  rc: { imageRate: number; videoRate: number; leadRate: number; revisionRate: number },
): number {
  switch (type) {
    case "image":
      return rc.imageRate;
    case "video":
      return rc.videoRate;
    case "lead_batch":
      return rc.leadRate;
    case "revision":
      return rc.revisionRate;
    default:
      return 0;
  }
}
