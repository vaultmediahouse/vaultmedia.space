/**
 * Qualified-lead rules (PRD §2.2). Pure functions, unit-tested in tests/lead-rules.test.ts.
 *
 * A lead is billable at the lead rate only when it has:
 *   1. a valid reachable phone number (10-digit Indian mobile, optional +91/0 prefix),
 *   2. a name,
 *   3. at least one non-empty form answer (business / use-case),
 *   4. is not a duplicate (same phone for the same client within 30 days),
 *   5. is not marked Fake / Wrong Number by the client within the dispute window (48 h).
 *
 * Billing timing: a lead becomes billable either when the client gives positive feedback
 * (Contacted / Interested / Converted) or when the 48 h dispute window closes without a
 * Fake/Wrong mark. A lead still inside its window at the weekly cut-off rolls into next week.
 */
import type { LeadStatus } from "@/db/schema";

export const DISPUTE_WINDOW_HOURS = 48;
export const DUPLICATE_WINDOW_DAYS = 30;

export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  new: "New",
  contacted: "Contacted",
  interested: "Interested",
  converted: "Converted",
  fake: "Fake",
  wrong_number: "Wrong Number",
};

const POSITIVE: LeadStatus[] = ["contacted", "interested", "converted"];
const NEGATIVE: LeadStatus[] = ["fake", "wrong_number"];

/** Digits-only Indian mobile: strips +91 / 91 / 0 prefixes. Returns null if not a valid mobile. */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  if (!/^[6-9]\d{9}$/.test(digits)) return null;
  return digits;
}

export type LeadForRules = {
  name: string | null;
  phone: string | null;
  answers: Record<string, string>;
  isDuplicate: boolean;
  status: LeadStatus;
  receivedAt: Date;
  statusChangedAt: Date | null;
};

/** Missing-data problems that disqualify a lead regardless of client feedback. */
export function qualificationProblems(l: LeadForRules): string[] {
  const problems: string[] = [];
  if (!normalizePhone(l.phone)) problems.push("No valid phone number");
  if (!l.name || !l.name.trim()) problems.push("No name");
  if (!Object.values(l.answers ?? {}).some((v) => String(v ?? "").trim() !== "")) {
    problems.push("No form answer");
  }
  if (l.isDuplicate) problems.push(`Duplicate within ${DUPLICATE_WINDOW_DAYS} days`);
  if (NEGATIVE.includes(l.status)) problems.push(`Marked ${LEAD_STATUS_LABEL[l.status]}`);
  return problems;
}

export function disputeWindowEnds(l: Pick<LeadForRules, "receivedAt">): Date {
  return new Date(l.receivedAt.getTime() + DISPUTE_WINDOW_HOURS * 3_600_000);
}

/**
 * Can the client still mark this lead Fake / Wrong Number and have it count?
 * After the window, the client can still record the status (for their own tracking), but it
 * no longer removes the lead from billing.
 */
export function inDisputeWindow(l: Pick<LeadForRules, "receivedAt">, now: Date): boolean {
  return now.getTime() < disputeWindowEnds(l).getTime();
}

/**
 * The instant at which a lead became billable, or null if it is not (yet) billable at `asOf`.
 * Negative marks only count if they were made inside the dispute window.
 */
export function billableSince(l: LeadForRules, asOf: Date): Date | null {
  const windowEnd = disputeWindowEnds(l);
  const negativeInWindow =
    NEGATIVE.includes(l.status) &&
    (l.statusChangedAt ?? l.receivedAt).getTime() < windowEnd.getTime();
  if (negativeInWindow) return null;
  const dataProblems = qualificationProblems({ ...l, status: "new" });
  if (dataProblems.length > 0) return null;

  // Positive feedback inside the window makes it billable at that moment.
  if (POSITIVE.includes(l.status) && l.statusChangedAt && l.statusChangedAt < windowEnd) {
    return l.statusChangedAt <= asOf ? l.statusChangedAt : null;
  }
  return windowEnd <= asOf ? windowEnd : null;
}

/** Human-readable billing state for the leads table. */
export function leadBillingLabel(l: LeadForRules, now: Date): string {
  if (billableSince(l, now)) return "Billable";
  const problems = qualificationProblems(l);
  if (problems.length) return "Not billable: " + problems.join(", ");
  return "Pending (in 48 h review window)";
}
