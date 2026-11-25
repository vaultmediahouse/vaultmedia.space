import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Invoice, User } from "@/db/schema";
import { ActionForm, SubmitButton } from "./action-form";
import { InvoiceStatus } from "./status";
import { Card, DL, Input, PageHeader, Table, Td, Th } from "./ui";
import { CopyButton } from "./copy-button";
import { invoiceAction } from "@/actions/billing";
import { formatINR } from "@/lib/money";
import { getSettings } from "@/lib/settings";
import { formatISTDate, formatISTDateTime, istDate } from "@/lib/week";
import { appUrl } from "@/lib/app-url";

/** Invoice detail shared by Admin and Client billing pages. */
export async function InvoiceView({ inv, user }: { inv: Invoice; user: User }) {
  const isAdmin = user.role === "admin";
  const [lines, client, settings] = await Promise.all([
    db.select().from(schema.invoiceLines).where(eq(schema.invoiceLines.invoiceId, inv.id)).orderBy(desc(schema.invoiceLines.kind)),
    db.query.clients.findFirst({ where: eq(schema.clients.id, inv.clientId) }),
    getSettings(),
  ]);
  const overdue = inv.status === "sent" && inv.dueDate < istDate(new Date());
  const base = isAdmin ? "/admin" : "/portal";
  const shareLink = `${appUrl()}/portal/billing/${inv.id}`;
  const shareText = `${settings.businessName} invoice ${inv.number} for ${formatISTDate(inv.weekStart)} – ${formatISTDate(inv.weekEnd)}: ${formatINR(inv.total)}, due ${formatISTDate(inv.dueDate)}.${settings.upiId ? ` UPI: ${settings.upiId}.` : ""} View & download: ${shareLink}`;
  const upiLink = settings.upiId
    ? `upi://pay?pa=${encodeURIComponent(settings.upiId)}&pn=${encodeURIComponent(settings.businessName)}&am=${(inv.total / 100).toFixed(2)}&cu=INR&tn=${encodeURIComponent(inv.number)}`
    : null;

  return (
    <>
      <PageHeader
        title={<span className="flex items-center gap-2">Invoice {inv.number} <InvoiceStatus status={inv.status} overdue={overdue} /></span>}
        subtitle={`${client?.company} · week ${formatISTDate(inv.weekStart)} – ${formatISTDate(inv.weekEnd)}`}
        actions={
          <>
            <Link href={`${base}/billing`} className="px-2 py-2 text-sm text-muted hover:underline">← Billing</Link>
            <a href={`/api/invoices/${inv.id}/pdf`} className="rounded-md bg-ink px-3 py-2 text-sm font-medium text-white">Download PDF</a>
          </>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <Card>
          <Table>
            <thead><tr><Th>Description</Th><Th className="text-right">Qty</Th><Th className="text-right">Rate</Th><Th className="text-right">Amount</Th></tr></thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id}>
                  <Td>{l.workItemId ? <Link className="hover:underline" href={`${base}/work/${l.workItemId}`}>{l.description}</Link> : l.description}</Td>
                  <Td className="text-right tabular-nums">{l.qty}</Td>
                  <Td className="text-right tabular-nums">{formatINR(l.rate)}</Td>
                  <Td className="text-right tabular-nums">{formatINR(l.amount)}</Td>
                </tr>
              ))}
              <tr><Td colSpan={3} className="text-right text-muted">Subtotal</Td><Td className="text-right tabular-nums">{formatINR(inv.subtotal)}</Td></tr>
              {inv.taxRateBps > 0 && <tr><Td colSpan={3} className="text-right text-muted">GST {inv.taxRateBps / 100}%</Td><Td className="text-right tabular-nums">{formatINR(inv.tax)}</Td></tr>}
              <tr><Td colSpan={3} className="text-right font-semibold">Total</Td><Td className="text-right text-base font-semibold tabular-nums">{formatINR(inv.total)}</Td></tr>
            </tbody>
          </Table>
        </Card>
        <div className="space-y-6">
          <Card title="Payment">
            <DL
              items={[
                ["Issued", formatISTDateTime(inv.issuedAt)],
                ["Due", formatISTDate(inv.dueDate)],
                ...(inv.paymentRef ? [["Reference", inv.paymentRef] as [string, string]] : []),
                ...(inv.paidAt ? [["Paid", formatISTDateTime(inv.paidAt)] as [string, string]] : []),
              ]}
            />
            {inv.status !== "paid" && inv.status !== "void" && (
              <div className="mt-4 space-y-3 text-sm">
                {settings.upiId && (
                  <div className="rounded-md bg-slate-50 p-3">
                    <div className="text-xs text-muted">UPI</div>
                    <div className="flex items-center justify-between gap-2 font-mono">{settings.upiId} <CopyButton text={settings.upiId} /></div>
                    {upiLink && !isAdmin && <a href={upiLink} className="mt-2 inline-block text-sm font-medium text-emerald-700 underline">Pay {formatINR(inv.total)} with a UPI app</a>}
                  </div>
                )}
                {settings.bankDetails && <div className="whitespace-pre-wrap rounded-md bg-slate-50 p-3 text-xs">{settings.bankDetails}</div>}
                {!settings.upiId && !settings.bankDetails && isAdmin && <p className="text-xs text-amber-700">Add UPI / bank details in Settings so clients know how to pay.</p>}
                {!isAdmin && inv.status === "sent" && (
                  <ActionForm action={invoiceAction} hidden={{ id: inv.id, op: "submit_ref" }} className="space-y-2">
                    <Input name="ref" placeholder="UPI / bank reference (UTR)" required />
                    <SubmitButton>I&apos;ve paid — submit reference</SubmitButton>
                  </ActionForm>
                )}
                {!isAdmin && inv.status === "payment_submitted" && <p className="text-sm text-blue-700">Reference submitted. We&apos;ll confirm once received.</p>}
                {isAdmin && (
                  <>
                    <ActionForm action={invoiceAction} hidden={{ id: inv.id, op: "mark_paid" }} className="space-y-2">
                      <Input name="ref" placeholder="Reference (optional)" defaultValue={inv.paymentRef ?? ""} />
                      <SubmitButton variant="gold">Mark paid</SubmitButton>
                    </ActionForm>
                    <ActionForm action={invoiceAction} hidden={{ id: inv.id, op: "void" }} confirm="Void this invoice? Its items and leads return to the unbilled pool and can be invoiced again.">
                      <SubmitButton variant="ghost">Void invoice</SubmitButton>
                    </ActionForm>
                  </>
                )}
              </div>
            )}
          </Card>
          {isAdmin && (
            <Card title="Send to client">
              <p className="mb-2 text-xs text-muted">The client already sees it in the portal. Share on WhatsApp / Telegram too:</p>
              <pre className="mb-2 whitespace-pre-wrap rounded-md bg-slate-50 p-2 font-sans text-xs">{shareText}</pre>
              <div className="flex flex-wrap gap-2 text-sm">
                <CopyButton text={shareText} label="Copy message" />
                <a className="font-medium text-emerald-700 underline" target="_blank" rel="noreferrer" href={`https://wa.me/${client?.phone ? client.phone.replace(/\D/g, "").replace(/^(\d{10})$/, "91$1") : ""}?text=${encodeURIComponent(shareText)}`}>WhatsApp</a>
                <a className="font-medium text-sky-700 underline" target="_blank" rel="noreferrer" href={`https://t.me/share/url?url=${encodeURIComponent(shareLink)}&text=${encodeURIComponent(shareText)}`}>Telegram</a>
              </div>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
