import { describe, expect, it } from "vitest";
import { billingWeekFor, lastClosedWeek, istDate, weekContaining } from "@/lib/week";
import { taxFor, rupeesToPaise, formatINR } from "@/lib/money";

describe("billing week (IST, Sunday 8 PM cut-off)", () => {
  it("Monday-to-Sunday week", () => {
    const w = weekContaining("2026-11-25");
    expect(w.weekStart).toBe("2026-11-23");
    expect(w.weekEnd).toBe("2026-11-29");
    expect(w.cutoff.toISOString()).toBe("2026-11-29T14:30:00.000Z"); // 20:00 IST
  });
  it("Sunday 7:59 PM IST belongs to this week, 8:01 PM to next", () => {
    expect(billingWeekFor(new Date("2026-11-29T14:29:00Z")).weekStart).toBe("2026-11-23");
    expect(billingWeekFor(new Date("2026-11-29T14:31:00Z")).weekStart).toBe("2026-11-30");
  });
  it("a Monday run bills the week that just closed", () => {
    const w = lastClosedWeek(new Date("2026-11-30T03:00:00Z")); // Mon 8:30 AM IST
    expect(w.weekStart).toBe("2026-11-23");
  });
  it("IST date crosses midnight before UTC does", () => {
    expect(istDate(new Date("2026-11-24T19:00:00Z"))).toBe("2026-11-25");
  });
});

describe("money", () => {
  it("worked example from PRD 2.4 totals ₹8,800", () => {
    const total = 4 * 30000 + 2 * 30000 + 35 * 20000;
    expect(total).toBe(880000);
    expect(formatINR(total)).toBe("₹8,800");
  });
  it("GST 18% and rupee parsing", () => {
    expect(taxFor(880000, 1800)).toBe(158400);
    expect(rupeesToPaise("1,200.50")).toBe(120050);
    expect(rupeesToPaise("-1")).toBeNull();
  });
});
