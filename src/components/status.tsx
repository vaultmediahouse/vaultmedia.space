import type { WorkItemStatus, LeadStatus } from "@/db/schema";
import { STATUS_LABEL } from "@/lib/workflow";
import { LEAD_STATUS_LABEL } from "@/lib/lead-rules";
import { Badge, type Tone } from "./ui";

const WI_TONE: Record<WorkItemStatus, Tone> = {
  draft: "slate",
  proposed: "amber",
  sanctioned: "blue",
  in_progress: "violet",
  delivered: "gold",
  revision_requested: "amber",
  accepted: "green",
  billed: "blue",
  paid: "green",
  rejected: "red",
  cancelled: "slate",
};

export function WorkStatus({ status }: { status: WorkItemStatus }) {
  return <Badge tone={WI_TONE[status]}>{STATUS_LABEL[status]}</Badge>;
}

const LEAD_TONE: Record<LeadStatus, Tone> = {
  new: "slate",
  contacted: "blue",
  interested: "green",
  converted: "gold",
  fake: "red",
  wrong_number: "red",
};
export function LeadStatusBadge({ status }: { status: LeadStatus }) {
  return <Badge tone={LEAD_TONE[status]}>{LEAD_STATUS_LABEL[status]}</Badge>;
}

const INV: Record<string, [string, Tone]> = {
  draft: ["Draft", "slate"],
  sent: ["Unpaid", "amber"],
  payment_submitted: ["Payment submitted", "blue"],
  paid: ["Paid", "green"],
  void: ["Void", "slate"],
};
export function InvoiceStatus({ status, overdue }: { status: string; overdue?: boolean }) {
  if (overdue && status === "sent") return <Badge tone="red">Overdue</Badge>;
  const [label, tone] = INV[status] ?? [status, "slate"];
  return <Badge tone={tone}>{label}</Badge>;
}

const DOC: Record<string, [string, Tone]> = {
  draft: ["Draft", "slate"],
  sent: ["Sent", "amber"],
  viewed: ["Viewed", "blue"],
  accepted: ["Accepted", "green"],
  expired: ["Expired", "red"],
  archived: ["Archived", "slate"],
};
export function DocStatus({ status }: { status: string }) {
  const [label, tone] = DOC[status] ?? [status, "slate"];
  return <Badge tone={tone}>{label}</Badge>;
}
