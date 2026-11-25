/**
 * Billing week helpers. The business runs on India time (Asia/Kolkata, UTC+05:30, no DST).
 *
 * A billing week runs Monday 00:00 IST → the cut-off on Sunday (default 20:00 IST, PRD §2.3).
 * Anything that becomes billable after the cut-off rolls into the next week's invoice.
 * Because IST has no daylight saving, a fixed +05:30 offset is exact.
 */

const IST_OFFSET_MIN = 330;
const DAY_MS = 86_400_000;

/** Calendar date (YYYY-MM-DD) in IST for an instant. */
export function istDate(d: Date): string {
  const shifted = new Date(d.getTime() + IST_OFFSET_MIN * 60_000);
  return shifted.toISOString().slice(0, 10);
}

/** The UTC instant for a given IST calendar date + time. */
export function istInstant(date: string, hour = 0, minute = 0): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, hour, minute) - IST_OFFSET_MIN * 60_000);
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + days * DAY_MS).toISOString().slice(0, 10);
}

/** 0 = Monday … 6 = Sunday, for an IST calendar date. */
function weekdayMon0(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

export type BillingWeek = {
  /** Monday, YYYY-MM-DD (IST) */
  weekStart: string;
  /** Sunday, YYYY-MM-DD (IST) */
  weekEnd: string;
  /** Sunday cut-off instant (e.g. 20:00 IST) */
  cutoff: Date;
  /** Previous week's cut-off instant; items billable after this and up to `cutoff` belong here. */
  previousCutoff: Date;
};

/** The billing week (by its Monday) that contains IST date `date`. */
export function weekContaining(date: string, cutoffHour = 20): BillingWeek {
  const weekStart = addDays(date, -weekdayMon0(date));
  const weekEnd = addDays(weekStart, 6);
  return {
    weekStart,
    weekEnd,
    cutoff: istInstant(weekEnd, cutoffHour),
    previousCutoff: istInstant(addDays(weekEnd, -7), cutoffHour),
  };
}

/**
 * The billing week an instant falls into, honouring the cut-off: Sunday 21:00 IST already
 * belongs to the following week.
 */
export function billingWeekFor(instant: Date, cutoffHour = 20): BillingWeek {
  const w = weekContaining(istDate(instant), cutoffHour);
  if (instant.getTime() > w.cutoff.getTime()) {
    return weekContaining(addDays(w.weekStart, 7), cutoffHour);
  }
  return w;
}

/** The most recent week whose cut-off has passed — the week an invoice run on Monday bills. */
export function lastClosedWeek(now: Date, cutoffHour = 20): BillingWeek {
  const current = billingWeekFor(now, cutoffHour);
  return weekContaining(addDays(current.weekStart, -7), cutoffHour);
}

export function formatISTDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? (d.length === 10 ? istInstant(d, 12) : new Date(d)) : d;
  return date.toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatISTDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}
