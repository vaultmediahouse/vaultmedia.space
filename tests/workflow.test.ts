import { describe, expect, it } from "vitest";
import * as wf from "@/lib/workflow";

const t0 = new Date("2026-11-23T05:00:00Z");
const t1 = new Date("2026-11-23T06:00:00Z");
const draft: wf.ApprovalState = { status: "draft", adminApprovedAt: null, clientApprovedAt: null };

describe("dual approval", () => {
  it("creator's submission counts as first approval; item stays proposed", () => {
    const s = wf.submit(draft, "client", t0, { amount: 30000, autoSanctionLimit: 0 });
    expect(s.status).toBe("proposed");
    expect(s.clientApprovedAt).toEqual(t0);
    expect(s.adminApprovedAt).toBeNull();
  });

  it("cannot reach sanctioned without both approvals", () => {
    const s = wf.submit(draft, "admin", t0, { amount: 30000, autoSanctionLimit: 0 });
    expect(() => wf.approve(s, "admin", t1)).toThrow(/already approved/);
    const done = wf.approve(s, "client", t1);
    expect(done.status).toBe("sanctioned");
  });

  it("settle never sanctions with one approval", () => {
    expect(wf.settle({ status: "proposed", adminApprovedAt: t0, clientApprovedAt: null }).status).toBe("proposed");
  });

  it("auto-sanctions below the limit, not at or above it", () => {
    expect(wf.submit(draft, "client", t0, { amount: 49999, autoSanctionLimit: 50000 }).status).toBe("sanctioned");
    expect(wf.submit(draft, "client", t0, { amount: 50000, autoSanctionLimit: 50000 }).status).toBe("proposed");
    expect(wf.submit(draft, "client", t0, { amount: 100, autoSanctionLimit: 0 }).status).toBe("proposed");
  });

  it("editing terms after sanction resets the other party's approval", () => {
    const sanctioned: wf.ApprovalState = { status: "sanctioned", adminApprovedAt: t0, clientApprovedAt: t0 };
    const edited = wf.editTerms(sanctioned, "admin", t1);
    expect(edited).toEqual({ status: "proposed", adminApprovedAt: t1, clientApprovedAt: null });
    const inProgress: wf.ApprovalState = { status: "in_progress", adminApprovedAt: t0, clientApprovedAt: t0 };
    expect(wf.editTerms(inProgress, "client", t1).status).toBe("proposed");
  });

  it("edits are blocked once delivered", () => {
    expect(() => wf.editTerms({ status: "delivered", adminApprovedAt: t0, clientApprovedAt: t0 }, "admin", t1)).toThrow();
  });

  it("only drafts can be submitted and only proposed can be approved/rejected", () => {
    expect(() => wf.submit({ ...draft, status: "proposed" }, "admin", t0, { amount: 1, autoSanctionLimit: 0 })).toThrow();
    expect(() => wf.approve({ ...draft, status: "sanctioned" }, "client", t0)).toThrow();
    expect(() => wf.reject(draft)).toThrow();
  });
});

describe("transitions", () => {
  it("enforces who may move items", () => {
    expect(wf.canTransition("sanctioned", "in_progress", "admin")).toBe(true);
    expect(wf.canTransition("sanctioned", "in_progress", "client")).toBe(false);
    expect(wf.canTransition("delivered", "accepted", "client")).toBe(true);
    expect(wf.canTransition("delivered", "accepted", "admin")).toBe(false);
    expect(wf.canTransition("proposed", "in_progress", "admin")).toBe(false);
    expect(wf.canTransition("draft", "sanctioned", "admin")).toBe(false);
  });

  it("revisions: first N are free", () => {
    expect(wf.revisionIsFree(0, 2)).toBe(true);
    expect(wf.revisionIsFree(1, 2)).toBe(true);
    expect(wf.revisionIsFree(2, 2)).toBe(false);
  });

  it("auto-accepts after the window, and never when disabled", () => {
    const delivered = new Date("2026-11-20T10:00:00Z");
    expect(wf.shouldAutoAccept(delivered, new Date("2026-11-22T09:59:00Z"), 48)).toBe(false);
    expect(wf.shouldAutoAccept(delivered, new Date("2026-11-22T10:00:00Z"), 48)).toBe(true);
    expect(wf.shouldAutoAccept(delivered, new Date("2026-12-22T10:00:00Z"), 0)).toBe(false);
  });
});
