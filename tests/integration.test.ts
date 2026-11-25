/**
 * End-to-end service tests against a real PostgreSQL database (PRD §15 acceptance criteria).
 * Run with:  TEST_DATABASE_URL=postgres://…/vaultportal_test npm test
 * The database must be migrated (`DATABASE_URL=… npm run db:migrate`). All tables are wiped first.
 * Skipped automatically when TEST_DATABASE_URL is not set.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";

const enabled = !!process.env.TEST_DATABASE_URL;

describe("portal acceptance (integration)", async () => {
  if (!enabled) {
    it.skip("set TEST_DATABASE_URL to run the integration tests", () => {});
    return;
  }
  const { db, schema } = await import("@/db");
  const wi = await import("@/server/work-items");
  const billing = await import("@/server/billing");
  const leadsSvc = await import("@/server/leads");
  const docs = await import("@/server/documents");
  const { weekContaining, istDate, addDays } = await import("@/lib/week");
  const { DEFAULT_TEMPLATES } = await import("@/lib/templates");
  type User = typeof schema.users.$inferSelect;

  let admin: User, clientA: User, clientB: User;
  let clientAId: string, clientBId: string;

  beforeAll(async () => {
    await db.execute(sql`truncate activity_log, notifications, invoice_lines, invoices, comments, attachments, leads, work_items, documents, doc_templates, rate_cards, sessions, login_attempts, users, clients, settings restart identity cascade`);
    const [a] = await db.insert(schema.clients).values({ company: "Client A" }).returning();
    const [b] = await db.insert(schema.clients).values({ company: "Client B" }).returning();
    clientAId = a.id;
    clientBId = b.id;
    await db.insert(schema.rateCards).values([{ clientId: a.id }, { clientId: b.id }]);
    [admin] = await db.insert(schema.users).values({ role: "admin", name: "Chief", username: "chief", passwordHash: "x", mustChangePassword: false }).returning();
    [clientA] = await db.insert(schema.users).values({ role: "client", name: "A user", username: "a", passwordHash: "x", clientId: a.id, mustChangePassword: false }).returning();
    [clientB] = await db.insert(schema.users).values({ role: "client", name: "B user", username: "b", passwordHash: "x", clientId: b.id, mustChangePassword: false }).returning();
    for (const t of DEFAULT_TEMPLATES) await db.insert(schema.docTemplates).values(t);
  });

  it("cannot reach Sanctioned without both approvals", async () => {
    const item = await wi.createWorkItem(admin, { clientId: clientAId, type: "image", title: "Post", qty: 2, submit: true });
    expect(item.status).toBe("proposed");
    expect(item.amount).toBe(60000);
    await expect(wi.approveWorkItem(admin, item.id)).rejects.toThrow(/already approved/);
    const s = await wi.approveWorkItem(clientA, item.id);
    expect(s.status).toBe("sanctioned");
    expect(s.clientApprovedBy).toBe(clientA.id);
    expect(s.adminApprovedBy).toBe(admin.id);
  });

  it("clients cannot see or act on another client's items", async () => {
    const item = await wi.createWorkItem(clientA, { clientId: clientAId, type: "video", title: "Reel", qty: 1, submit: true });
    await expect(wi.approveWorkItem(clientB, item.id)).rejects.toThrow(/not found/i);
    await expect(wi.addComment(clientB, item.id, "hi")).rejects.toThrow(/not found/i);
    // A client creating an item can't target another client
    const own = await wi.createWorkItem(clientB, { clientId: clientAId, type: "image", title: "Sneaky", qty: 1, submit: false });
    expect(own.clientId).toBe(clientBId);
  });

  it("clients cannot set their own rate", async () => {
    const item = await wi.createWorkItem(clientA, { clientId: clientAId, type: "image", title: "Cheap", qty: 1, rate: 1, submit: false });
    expect(item.rate).toBe(30000);
  });

  it("approval is refused if the terms changed since the approver saw them", async () => {
    const item = await wi.createWorkItem(admin, { clientId: clientAId, type: "image", title: "Race", qty: 1, submit: true });
    await expect(wi.approveWorkItem(clientA, item.id, { qty: 1, rate: 30000, amount: 60000 })).rejects.toThrow(/changed/);
    const ok = await wi.approveWorkItem(clientA, item.id, { qty: 1, rate: 30000, amount: 30000 });
    expect(ok.status).toBe("sanctioned");
  });

  it("post-sanction edit to qty or rate resets approvals", async () => {
    const item = await wi.createWorkItem(admin, { clientId: clientAId, type: "image", title: "Edit me", qty: 1, submit: true });
    await wi.approveWorkItem(clientA, item.id);
    const edited = await wi.editWorkItem(admin, item.id, { title: "Edit me", brief: null, qty: 3, rate: null, dueDate: null });
    expect(edited.status).toBe("proposed");
    expect(edited.clientApprovedAt).toBeNull();
    expect(edited.adminApprovedAt).not.toBeNull();
    expect(edited.amount).toBe(90000);
    // due-date-only change does not reset
    const again = await wi.approveWorkItem(clientA, item.id);
    const dated = await wi.editWorkItem(admin, item.id, { title: "Edit me", brief: null, qty: 3, rate: null, dueDate: "2026-12-31" });
    expect(dated.status).toBe(again.status);
    expect(dated.status).toBe("sanctioned");
  });

  it("delivery requires a deliverable; revisions beyond the free limit create a paid item", async () => {
    const item = await wi.createWorkItem(admin, { clientId: clientAId, type: "image", title: "Revise", qty: 1, submit: true });
    await wi.approveWorkItem(clientA, item.id);
    await wi.transitionWorkItem(admin, item.id, "in_progress");
    await expect(wi.transitionWorkItem(admin, item.id, "delivered")).rejects.toThrow(/Upload/);
    await wi.addAttachment(admin, item.id, { kind: "deliverable", url: "https://example.com/final.png", fileName: "final" });
    await expect(wi.addAttachment(clientA, item.id, { kind: "deliverable", url: "https://x.y" })).rejects.toThrow(/Only Admin/);
    for (let n = 1; n <= 3; n++) {
      if (n > 1) {
        // Re-delivery after a revision needs a new deliverable.
        await expect(wi.transitionWorkItem(admin, item.id, "delivered")).rejects.toThrow(/revised file/);
        await new Promise((r) => setTimeout(r, 5));
        await wi.addAttachment(admin, item.id, { kind: "deliverable", url: `https://example.com/v${n}.png`, fileName: `v${n}` });
      }
      await wi.transitionWorkItem(admin, item.id, "delivered");
      const { paidItem } = await wi.requestRevision(clientA, item.id, `change ${n}`);
      if (n <= 2) expect(paidItem).toBeNull();
      else {
        expect(paidItem?.type).toBe("revision");
        expect(paidItem?.amount).toBe(10000);
        expect(paidItem?.status).toBe("proposed");
        expect(paidItem?.clientApprovedAt).not.toBeNull();
      }
      await wi.transitionWorkItem(admin, item.id, "in_progress");
    }
  });

  it("auto-sanctions below the client's limit", async () => {
    await db.update(schema.rateCards).set({ autoSanctionLimit: 50000 }).where(eq(schema.rateCards.clientId, clientBId));
    const small = await wi.createWorkItem(clientB, { clientId: clientBId, type: "image", title: "Small", qty: 1, submit: true });
    expect(small.status).toBe("sanctioned");
    const big = await wi.createWorkItem(clientB, { clientId: clientBId, type: "image", title: "Big", qty: 2, submit: true });
    expect(big.status).toBe("proposed");
  });

  it("weekly invoice includes only accepted items and qualified leads; idempotent; totals match", async () => {
    // A week that has closed: two weeks ago.
    const week = weekContaining(addDays(istDate(new Date()), -14));
    const inWeek = new Date(week.cutoff.getTime() - 3 * 86_400_000);

    // Accepted item inside the week
    const item = await wi.createWorkItem(admin, { clientId: clientAId, type: "video", title: "Billable reel", qty: 2, submit: true });
    await wi.approveWorkItem(clientA, item.id);
    await db.update(schema.workItems).set({ status: "accepted", acceptedAt: inWeek }).where(eq(schema.workItems.id, item.id));
    // Delivered but NOT accepted (and auto-accept off) – must not be billed
    const pending = await wi.createWorkItem(admin, { clientId: clientAId, type: "image", title: "Not accepted", qty: 1, submit: true });
    await wi.approveWorkItem(clientA, pending.id);
    await db.update(schema.workItems).set({ status: "delivered", deliveredAt: inWeek }).where(eq(schema.workItems.id, pending.id));
    // Accepted AFTER the cut-off – rolls to next week
    const late = await wi.createWorkItem(admin, { clientId: clientAId, type: "image", title: "Late", qty: 1, submit: true });
    await wi.approveWorkItem(clientA, late.id);
    await db.update(schema.workItems).set({ status: "accepted", acceptedAt: new Date(week.cutoff.getTime() + 60_000) }).where(eq(schema.workItems.id, late.id));

    // Leads: 3 good, 1 fake within 48h, 1 duplicate, 1 missing answer, 1 received 1h before cut-off (still in window)
    const base = new Date(week.cutoff.getTime() - 5 * 86_400_000);
    const created = await leadsSvc.addLeads(admin, clientAId, [
      { name: "One", phone: "9825000001", answers: { q: "Bank" }, receivedAt: base },
      { name: "Two", phone: "9825000002", answers: { q: "Shop" }, receivedAt: base },
      { name: "Three", phone: "9825000003", answers: { q: "Pump" }, receivedAt: base },
      { name: "Fake", phone: "9825000004", answers: { q: "x" }, receivedAt: base },
      { name: "Dup", phone: "+91 98250 00001", answers: { q: "Bank" }, receivedAt: new Date(base.getTime() + 3_600_000) },
      { name: "NoAnswer", phone: "9825000006", answers: {}, receivedAt: base },
      { name: "Late lead", phone: "9825000007", answers: { q: "y" }, receivedAt: new Date(week.cutoff.getTime() - 3_600_000) },
    ]);
    expect(created.find((l) => l.name === "Dup")?.isDuplicate).toBe(true);
    await db.update(schema.leads).set({ status: "fake", statusChangedAt: new Date(base.getTime() + 2 * 3_600_000) }).where(eq(schema.leads.name, "Fake"));

    const { saveSettings } = await import("@/lib/settings");
    await saveSettings({ autoAcceptHours: 0, gstEnabled: true, gstin: "24ABCDE1234F1Z5", gstRateBps: 1800 });

    const inv = await billing.generateInvoice(admin, clientAId, week);
    expect(inv).not.toBeNull();
    const lines = await db.select().from(schema.invoiceLines).where(eq(schema.invoiceLines.invoiceId, inv!.id));
    const itemLines = lines.filter((l) => l.kind === "work_item");
    expect(itemLines.map((l) => l.workItemId)).toEqual([item.id]);
    const leadLine = lines.find((l) => l.kind === "leads");
    expect(leadLine?.qty).toBe(3);
    expect(leadLine?.amount).toBe(60000);
    expect(inv!.subtotal).toBe(60000 + 60000);
    expect(inv!.tax).toBe(21600);
    expect(inv!.total).toBe(141600);
    expect(lines.reduce((s, l) => s + l.amount, 0)).toBe(inv!.subtotal);

    // Idempotent
    expect(await billing.generateInvoice(admin, clientAId, week)).toBeNull();
    // Billed items flip to billed; others untouched
    const after = await db.query.workItems.findFirst({ where: eq(schema.workItems.id, item.id) });
    expect(after?.status).toBe("billed");
    const stillLate = await db.query.workItems.findFirst({ where: eq(schema.workItems.id, late.id) });
    expect(stillLate?.invoiceId).toBeNull();
    // Client B's data never appears on A's invoice
    expect(lines.every((l) => !l.description.includes("Small"))).toBe(true);

    // Payment: client submits ref, admin marks paid → items paid
    await expect(billing.submitPaymentRef(clientB, inv!.id, "UTR1")).rejects.toThrow(/not found/i);
    await billing.submitPaymentRef(clientA, inv!.id, "UTR123");
    await billing.markInvoicePaid(admin, inv!.id, null);
    const paid = await db.query.workItems.findFirst({ where: eq(schema.workItems.id, item.id) });
    expect(paid?.status).toBe("paid");
    const invPaid = await db.query.invoices.findFirst({ where: eq(schema.invoices.id, inv!.id) });
    expect(invPaid?.paymentRef).toBe("UTR123");
    expect(invPaid?.number).toMatch(/^VMH-\d{4}-0001$/);
  });

  it("voiding returns items to the unbilled pool and allows regeneration", async () => {
    const week = weekContaining(addDays(istDate(new Date()), -21));
    const item = await wi.createWorkItem(admin, { clientId: clientBId, type: "image", title: "Void me", qty: 1, submit: true });
    expect(item.status).toBe("sanctioned"); // below client B's auto-sanction limit
    await db.update(schema.workItems).set({ status: "accepted", acceptedAt: new Date(week.cutoff.getTime() - 86_400_000) }).where(eq(schema.workItems.id, item.id));
    const inv = await billing.generateInvoice(admin, clientBId, week);
    await billing.voidInvoice(admin, inv!.id);
    const back = await db.query.workItems.findFirst({ where: eq(schema.workItems.id, item.id) });
    expect(back?.status).toBe("accepted");
    const again = await billing.generateInvoice(admin, clientBId, week);
    expect(again?.number).not.toBe(inv!.number);
  });

  it("adjustment lines change totals while open and are refused once payment is submitted", async () => {
    const week = weekContaining(addDays(istDate(new Date()), -28));
    const item = await wi.createWorkItem(admin, { clientId: clientBId, type: "image", title: "Adjust me", qty: 1, submit: true });
    await db.update(schema.workItems).set({ status: "accepted", acceptedAt: new Date(week.cutoff.getTime() - 86_400_000) }).where(eq(schema.workItems.id, item.id));
    const inv = (await billing.generateInvoice(admin, clientBId, week))!;
    await billing.addInvoiceAdjustment(admin, inv.id, { description: "Setup fee", amount: 300000 });
    await billing.addInvoiceAdjustment(admin, inv.id, { description: "Discount", amount: -5000 });
    let now = await db.query.invoices.findFirst({ where: eq(schema.invoices.id, inv.id) });
    expect(now!.subtotal).toBe(inv.subtotal + 300000 - 5000);
    expect(now!.total).toBe(now!.subtotal + now!.tax);
    await expect(billing.addInvoiceAdjustment(clientB, inv.id, { description: "x", amount: 100 })).rejects.toThrow(/Admin/);
    await expect(billing.addInvoiceAdjustment(admin, inv.id, { description: "Too much", amount: -10_000_000 })).rejects.toThrow(/below zero/);
    const disc = (await db.select().from(schema.invoiceLines).where(eq(schema.invoiceLines.invoiceId, inv.id))).find((l) => l.description === "Discount")!;
    await billing.removeInvoiceAdjustment(admin, inv.id, disc.id);
    now = await db.query.invoices.findFirst({ where: eq(schema.invoices.id, inv.id) });
    expect(now!.subtotal).toBe(inv.subtotal + 300000);
    const workLine = (await db.select().from(schema.invoiceLines).where(eq(schema.invoiceLines.invoiceId, inv.id))).find((l) => l.kind === "work_item")!;
    await expect(billing.removeInvoiceAdjustment(admin, inv.id, workLine.id)).rejects.toThrow(/Only adjustment/);
    await billing.submitPaymentRef(clientB, inv.id, "UTR1");
    await expect(billing.addInvoiceAdjustment(admin, inv.id, { description: "Late", amount: 100 })).rejects.toThrow(/before the client pays/);
  });

  it("lead retention anonymises old leads only, once", async () => {
    const old = new Date();
    old.setMonth(old.getMonth() - 13);
    const [oldLead] = await db.insert(schema.leads).values({ clientId: clientAId, name: "Old Person", phone: "+91 9800000001", phoneNormalized: "9800000001", answers: { q: "a" }, source: "test", receivedAt: old }).returning();
    const [newLead] = await db.insert(schema.leads).values({ clientId: clientAId, name: "New Person", phone: "+91 9800000002", phoneNormalized: "9800000002", answers: { q: "b" }, source: "test" }).returning();
    expect(await leadsSvc.runLeadRetention()).toBeGreaterThanOrEqual(1);
    const o = await db.query.leads.findFirst({ where: eq(schema.leads.id, oldLead.id) });
    const n = await db.query.leads.findFirst({ where: eq(schema.leads.id, newLead.id) });
    expect(o).toMatchObject({ name: "[erased]", phone: null, phoneNormalized: null, answers: {} });
    expect(n?.name).toBe("New Person");
    expect(await leadsSvc.runLeadRetention()).toBe(0);
  });

  it("documents: send → viewed → accepted (locked); edit creates a new version", async () => {
    const tpl = await db.query.docTemplates.findFirst({ where: eq(schema.docTemplates.type, "nda") });
    const { saveSettings } = await import("@/lib/settings");
    await saveSettings({ businessAddress: "Ahmedabad", upiId: "vmh@upi", bankDetails: "Bank" });
    const doc = await docs.createFromTemplate(admin, clientAId, tpl!.id);
    expect(doc.content).toContain("Client A");
    await expect(docs.markViewed(clientA, doc.id)).rejects.toThrow(/not found/i); // drafts are hidden
    await docs.sendDocument(admin, doc.id, null);
    await expect(docs.markViewed(clientB, doc.id)).rejects.toThrow(/not found/i);
    const viewed = await docs.markViewed(clientA, doc.id);
    expect(viewed.status).toBe("viewed");
    expect(viewed.viewedAt).not.toBeNull();
    await expect(docs.acceptDocument(clientA, doc.id, { typedName: "A user", agreed: false, ip: "1.2.3.4" })).rejects.toThrow(/Tick/);
    const accepted = await docs.acceptDocument(clientA, doc.id, { typedName: "A user", agreed: true, ip: "1.2.3.4" });
    expect(accepted.status).toBe("accepted");
    expect(accepted.acceptedIp).toBe("1.2.3.4");
    const v2 = await docs.saveDocument(admin, doc.id, accepted.title, accepted.content + "\nNew clause");
    expect(v2.id).not.toBe(doc.id);
    expect(v2.version).toBe(2);
    const original = await db.query.documents.findFirst({ where: eq(schema.documents.id, doc.id) });
    expect(original?.status).toBe("accepted");
    expect(original?.content).toBe(accepted.content);
  });

  it("required-docs rule blocks new work until Contract and SOW are accepted", async () => {
    await db.update(schema.clients).set({ requireDocsBeforeWork: true, contactName: "B Owner", address: "CG Road", city: "Ahmedabad" }).where(eq(schema.clients.id, clientBId));
    await expect(wi.createWorkItem(clientB, { clientId: clientBId, type: "image", title: "Blocked", qty: 1, submit: true })).rejects.toThrow(/Contract and SOW/);
    for (const type of ["contract", "sow"] as const) {
      const tpl = await db.query.docTemplates.findFirst({ where: eq(schema.docTemplates.type, type) });
      const doc = await docs.createFromTemplate(admin, clientBId, tpl!.id, { deposit_amount: "₹0" });
      await docs.sendDocument(admin, doc.id, null);
      await docs.acceptDocument(clientB, doc.id, { typedName: "B user", agreed: true, ip: "1.1.1.1" });
    }
    const ok = await wi.createWorkItem(clientB, { clientId: clientBId, type: "image", title: "Allowed", qty: 1, submit: false });
    expect(ok.status).toBe("draft");
  });

  it("CSV import maps Meta export columns and skips re-imports", async () => {
    const csv = 'id,created_time,full_name,phone_number,what_is_your_business?,campaign_name\n1,2026-11-20T10:00:00+0530,Ravi Shah,p:+919825111111,Bank,Diwali\n2,2026-11-20T11:00:00+0530,"Patel, Mina",p:+919825222222,"Shop, retail",Diwali\n';
    const { leads } = leadsSvc.csvToLeads(csv);
    expect(leads).toHaveLength(2);
    expect(leads[1].name).toBe("Patel, Mina");
    expect(leads[0].answers).toEqual({ "what is your business?": "Bank" });
    const first = await leadsSvc.addLeads(admin, clientBId, leads);
    expect(first).toHaveLength(2);
    const second = await leadsSvc.addLeads(admin, clientBId, leadsSvc.csvToLeads(csv).leads);
    expect(second).toHaveLength(0);
  });

  it("logs approvals in the audit log", async () => {
    const rows = await db.select().from(schema.activityLog).where(eq(schema.activityLog.action, "approve"));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.userId)).toBe(true);
  });
});
