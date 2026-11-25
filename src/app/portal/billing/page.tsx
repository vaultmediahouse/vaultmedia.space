import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import { InvoiceStatus } from "@/components/status";
import { Card, Empty, PageHeader, Stat, Table, Td, Th } from "@/components/ui";
import { requireClient } from "@/lib/auth";
import { formatINR } from "@/lib/money";
import { getSettings } from "@/lib/settings";
import { formatISTDate, istDate } from "@/lib/week";
import { openWeekPayable } from "@/server/queries";

export const metadata: Metadata = { title: "Billing" };

export default async function PortalBilling() {
  const user = await requireClient();
  const invoices = await db.select().from(schema.invoices).where(and(eq(schema.invoices.clientId, user.clientId), ne(schema.invoices.status, "void"))).orderBy(desc(schema.invoices.issuedAt));
  const open = await openWeekPayable(user.clientId);
  const settings = await getSettings();
  const today = istDate(new Date());
  const unpaid = invoices.filter((i) => i.status === "sent" || i.status === "payment_submitted");
  const paid = invoices.filter((i) => i.status === "paid");
  return (
    <>
      <PageHeader title="Billing" subtitle="Invoices arrive every Monday for work accepted up to Sunday's cut-off." />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3">
        <Stat label="Unpaid" value={formatINR(unpaid.reduce((s, i) => s + i.total, 0))} hint={`${unpaid.length} invoice(s)`} />
        <Stat label="Running this week" value={formatINR(open.itemsAmount + open.leadsAmount)} hint="Not invoiced yet" />
        <Stat label="Paid to date" value={formatINR(paid.reduce((s, i) => s + i.total, 0))} />
      </div>
      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <Card title="Invoices">
          {invoices.length === 0 ? <Empty>No invoices yet.</Empty> : (
            <Table>
              <thead><tr><Th>Invoice</Th><Th>Week</Th><Th>Total</Th><Th>Due</Th><Th>Status</Th></tr></thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50">
                    <Td><Link href={`/portal/billing/${inv.id}`} className="font-medium hover:underline">{inv.number}</Link></Td>
                    <Td>{formatISTDate(inv.weekStart)} – {formatISTDate(inv.weekEnd)}</Td>
                    <Td className="tabular-nums">{formatINR(inv.total)}</Td>
                    <Td>{formatISTDate(inv.dueDate)}</Td>
                    <Td><InvoiceStatus status={inv.status} overdue={inv.dueDate < today} /></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
        <Card title="How to pay">
          <div className="space-y-2 text-sm">
            {settings.upiId && <div><div className="text-xs text-muted">UPI</div><div className="font-mono">{settings.upiId}</div></div>}
            {settings.bankDetails && <div className="whitespace-pre-wrap text-xs">{settings.bankDetails}</div>}
            {!settings.upiId && !settings.bankDetails && <p className="text-muted">Payment details will be shared on your invoice.</p>}
            <p className="text-xs text-muted">After paying, open the invoice and submit your UPI / bank reference (UTR).</p>
          </div>
        </Card>
      </div>
    </>
  );
}
