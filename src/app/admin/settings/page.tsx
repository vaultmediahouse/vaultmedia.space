import type { Metadata } from "next";
import { asc } from "drizzle-orm";
import { db, schema } from "@/db";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, Empty, Field, Input, PageHeader, Table, Td, Textarea, Th } from "@/components/ui";
import { saveSettingsAction } from "@/actions/admin";
import { saveClientDocTypesAction } from "@/actions/documents";
import { DOC_TYPE_LABEL, REQUIRED_DOCS } from "@/lib/templates";
import { requireAdmin } from "@/lib/auth";
import { paiseToRupeesInput } from "@/lib/money";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  await requireAdmin();
  const s = await getSettings();
  const r = s.defaultRates;
  const clients = await db.select().from(schema.clients).orderBy(asc(schema.clients.company));
  return (
    <>
      <PageHeader title="Settings" subtitle="Agency details, tax, invoice numbering, weekly cut-off and default rates for new clients." />
      <ActionForm action={saveSettingsAction} className="grid max-w-5xl gap-6 lg:grid-cols-2">
        <Card title="Agency">
          <div className="space-y-3">
            <Field label="Business name"><Input name="businessName" defaultValue={s.businessName} /></Field>
            <Field label="Address"><Textarea name="businessAddress" rows={2} defaultValue={s.businessAddress} /></Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Email"><Input name="businessEmail" type="email" defaultValue={s.businessEmail} /></Field>
              <Field label="Phone"><Input name="businessPhone" defaultValue={s.businessPhone} /></Field>
            </div>
            <Field label="Jurisdiction for contracts"><Input name="jurisdiction" defaultValue={s.jurisdiction} /></Field>
          </div>
        </Card>
        <Card title="Tax & payment">
          <div className="space-y-3">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="gstEnabled" defaultChecked={s.gstEnabled} /> Charge and show GST on invoices</label>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="GSTIN"><Input name="gstin" defaultValue={s.gstin} /></Field>
              <Field label="GST rate (%)"><Input name="gstRate" inputMode="decimal" defaultValue={s.gstRateBps / 100} /></Field>
            </div>
            <Field label="UPI ID"><Input name="upiId" placeholder="name@bank" defaultValue={s.upiId} /></Field>
            <Field label="Bank details (shown on invoices)"><Textarea name="bankDetails" rows={4} placeholder={"Account name\nAccount no.\nIFSC\nBank, branch"} defaultValue={s.bankDetails} /></Field>
          </div>
        </Card>
        <Card title="Billing cycle">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Invoice prefix"><Input name="invoicePrefix" defaultValue={s.invoicePrefix} /></Field>
            <Field label="Next invoice number" hint="(can only go up)"><Input name="nextInvoiceNumber" type="number" min={s.nextInvoiceNumber} defaultValue={s.nextInvoiceNumber} /></Field>
            <Field label="Sunday cut-off hour (IST, 0–23)"><Input name="cutoffHour" type="number" min={0} max={23} defaultValue={s.cutoffHour} /></Field>
            <Field label="Payment window (days)"><Input name="paymentWindowDays" type="number" min={0} defaultValue={s.paymentWindowDays} /></Field>
            <Field label="Auto-accept deliveries after (hours)" hint="0 = off"><Input name="autoAcceptHours" type="number" min={0} defaultValue={s.autoAcceptHours} /></Field>
            <Field label="Erase lead personal data after (months)" hint="Name, phone and answers are removed by the daily job; counts stay for invoices. 0 = keep. The DPA template says 12."><Input name="leadRetentionMonths" type="number" min={0} defaultValue={s.leadRetentionMonths} /></Field>
            <Field label="Sign out after inactivity (minutes)"><Input name="sessionIdleMinutes" type="number" min={10} defaultValue={s.sessionIdleMinutes} /></Field>
          </div>
          <p className="mt-3 text-xs text-muted">Example invoice number: {s.invoicePrefix}-2026-{String(s.nextInvoiceNumber).padStart(4, "0")}</p>
        </Card>
        <Card title="Default rate card for new clients (₹)">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Image creative"><Input name="imageRate" inputMode="decimal" defaultValue={paiseToRupeesInput(r.imageRate)} /></Field>
            <Field label="Video creative"><Input name="videoRate" inputMode="decimal" defaultValue={paiseToRupeesInput(r.videoRate)} /></Field>
            <Field label="Qualified lead"><Input name="leadRate" inputMode="decimal" defaultValue={paiseToRupeesInput(r.leadRate)} /></Field>
            <Field label="Extra revision"><Input name="revisionRate" inputMode="decimal" defaultValue={paiseToRupeesInput(r.revisionRate)} /></Field>
            <Field label="Setup fee"><Input name="setupFee" inputMode="decimal" defaultValue={paiseToRupeesInput(r.setupFee)} /></Field>
            <Field label="Free revisions"><Input name="freeRevisions" type="number" min={0} defaultValue={r.freeRevisions} /></Field>
            <Field label="Max video length (sec)"><Input name="maxVideoSeconds" type="number" min={1} defaultValue={r.maxVideoSeconds} /></Field>
          </div>
          <p className="mt-3 text-xs text-muted">Each client&apos;s own rate card is edited on the client page.</p>
        </Card>
        <div className="lg:col-span-2"><SubmitButton>Save settings</SubmitButton></div>
      </ActionForm>

      <Card title="Documents per client" className="mt-8 max-w-5xl">
        <div id="documents" className="scroll-mt-20" />
        <p className="mb-3 text-sm text-muted">Tick the documents each client needs. Checklists, progress and the &quot;Still to send&quot; list on the Documents page follow these choices. Clients only ever see documents you have sent them. If Contract or SOW is unticked, it no longer blocks that client&apos;s new work.</p>
        {clients.length === 0 ? <Empty>No clients yet.</Empty> : (
          <ActionForm action={saveClientDocTypesAction} className="space-y-3">
            <Table>
              <thead><tr><Th>Client</Th>{REQUIRED_DOCS.map((t) => <Th key={t} className="text-center">{DOC_TYPE_LABEL[t]}</Th>)}</tr></thead>
              <tbody>
                {clients.map((c) => (
                  <tr key={c.id}>
                    <Td>
                      <input type="hidden" name="clientIds" value={c.id} />
                      <span className="font-medium">{c.company}</span>{!c.active && <span className="ml-1 text-xs text-muted">(inactive)</span>}
                    </Td>
                    {REQUIRED_DOCS.map((t) => (
                      <Td key={t} className="text-center">
                        <input type="checkbox" name={`types:${c.id}`} value={t} defaultChecked={c.docTypes.includes(t)} aria-label={`${DOC_TYPE_LABEL[t]} for ${c.company}`} className="h-4 w-4" />
                      </Td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </Table>
            <SubmitButton>Save documents per client</SubmitButton>
          </ActionForm>
        )}
      </Card>
    </>
  );
}
