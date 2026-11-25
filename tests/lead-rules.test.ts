import { describe, expect, it } from "vitest";
import { billableSince, normalizePhone, qualificationProblems, type LeadForRules } from "@/lib/lead-rules";

const received = new Date("2026-11-23T06:00:00Z");
const H = 3_600_000;
const base: LeadForRules = {
  name: "Ramesh Patel",
  phone: "+91 98250 12345",
  answers: { "business type": "Bank branch" },
  isDuplicate: false,
  status: "new",
  receivedAt: received,
  statusChangedAt: null,
};

describe("normalizePhone", () => {
  it("accepts Indian mobiles with prefixes", () => {
    expect(normalizePhone("+91 98250 12345")).toBe("9825012345");
    expect(normalizePhone("09825012345")).toBe("9825012345");
    expect(normalizePhone("919825012345")).toBe("9825012345");
  });
  it("rejects invalid numbers", () => {
    expect(normalizePhone("12345")).toBeNull();
    expect(normalizePhone("5825012345")).toBeNull();
    expect(normalizePhone("")).toBeNull();
  });
});

describe("qualified lead rules (PRD 2.2)", () => {
  it("needs phone, name and an answer, and must not be duplicate", () => {
    expect(qualificationProblems(base)).toEqual([]);
    expect(qualificationProblems({ ...base, name: " " })).toContain("No name");
    expect(qualificationProblems({ ...base, phone: "123" })).toContain("No valid phone number");
    expect(qualificationProblems({ ...base, answers: { q: "" } })).toContain("No form answer");
    expect(qualificationProblems({ ...base, isDuplicate: true })[0]).toMatch(/Duplicate/);
  });

  it("becomes billable when the 48 h window closes with no dispute", () => {
    expect(billableSince(base, new Date(received.getTime() + 47 * H))).toBeNull();
    expect(billableSince(base, new Date(received.getTime() + 48 * H))).toEqual(new Date(received.getTime() + 48 * H));
  });

  it("positive feedback inside the window makes it billable immediately", () => {
    const l = { ...base, status: "interested" as const, statusChangedAt: new Date(received.getTime() + 2 * H) };
    expect(billableSince(l, new Date(received.getTime() + 3 * H))).toEqual(l.statusChangedAt);
  });

  it("fake / wrong number inside the window is never billable", () => {
    const l = { ...base, status: "fake" as const, statusChangedAt: new Date(received.getTime() + 10 * H) };
    expect(billableSince(l, new Date(received.getTime() + 1000 * H))).toBeNull();
  });

  it("fake marked after the window does not remove it from billing", () => {
    const l = { ...base, status: "wrong_number" as const, statusChangedAt: new Date(received.getTime() + 50 * H) };
    expect(billableSince(l, new Date(received.getTime() + 60 * H))).toEqual(new Date(received.getTime() + 48 * H));
  });

  it("missing data is never billable even with positive feedback", () => {
    const l = { ...base, name: null, status: "converted" as const, statusChangedAt: received };
    expect(billableSince(l, new Date(received.getTime() + 100 * H))).toBeNull();
  });
});
