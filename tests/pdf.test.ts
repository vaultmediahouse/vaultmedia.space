import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { invoicePdf } from "@/server/pdf";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import type { Client, Invoice, InvoiceLine } from "@/db/schema";

// PDFs print ₹ through the Noto Sans fallback font (D-018); Helvetica has no ₹ glyph.
describe("invoice PDF", () => {
  it("renders and embeds the ₹ fallback font", async () => {
    const inv = {
      id: "i1", number: "VMH-2026-0001", status: "unpaid", weekStart: "2026-11-16", weekEnd: "2026-11-22",
      issuedAt: new Date("2026-11-23T04:00:00Z"), dueDate: "2026-11-26", subtotal: 160000, taxRateBps: 0, tax: 0,
      total: 160000, paidAt: null, paymentRef: null,
    } as unknown as Invoice;
    const lines = [
      { id: "l1", description: "#3 Image creative: Republic Day posts", qty: 2, rate: 30000, amount: 60000 },
      { id: "l2", description: "Qualified leads", qty: 5, rate: 20000, amount: 100000 },
    ] as unknown as InvoiceLine[];
    const client = { id: "c1", company: "Test Traders", address: "Ahmedabad", gstNo: null } as unknown as Client;
    const pdf = await invoicePdf(inv, lines, client, DEFAULT_SETTINGS);
    if (process.env.PDF_OUT) writeFileSync(process.env.PDF_OUT, pdf);
    const raw = Buffer.from(pdf).toString("latin1");
    expect(raw.startsWith("%PDF")).toBe(true);
    expect(raw).toMatch(/NotoSans-(Regular|Bold)/);
    expect(raw).not.toContain("Rs.");
  });
});
