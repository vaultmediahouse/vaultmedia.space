import type { Lead, LeadStatus } from "@/db/schema";
import { ActionForm, ActionButton } from "./action-form";
import { LeadStatusBadge } from "./status";
import { Badge, Empty, Table, Td, Th } from "./ui";
import { leadAction } from "@/actions/leads";
import { inDisputeWindow, leadBillingLabel, LEAD_STATUS_LABEL } from "@/lib/lead-rules";
import { formatISTDateTime } from "@/lib/week";
import { LeadStatusSelect } from "./lead-status-select";

/** Leads table used by Admin → Leads and Client → My Leads. */
export function LeadsTable({ leads, isAdmin, companies }: { leads: Lead[]; isAdmin: boolean; companies?: Map<string, string> }) {
  if (!leads.length) return <Empty>No leads in this range.</Empty>;
  const now = new Date();
  return (
    <Table>
      <thead>
        <tr>
          <Th>Received</Th>
          {isAdmin && companies && <Th>Client</Th>}
          <Th>Name</Th>
          <Th>Phone</Th>
          <Th>Answers</Th>
          <Th>Status</Th>
          <Th>Billing</Th>
          {isAdmin && <Th></Th>}
        </tr>
      </thead>
      <tbody>
        {leads.map((l) => {
          const billing = l.invoiceId ? "Invoiced" : leadBillingLabel(l, now);
          return (
            <tr key={l.id} className={l.isDuplicate || l.status === "fake" || l.status === "wrong_number" ? "bg-red-50/40" : ""}>
              <Td className="whitespace-nowrap text-xs">{formatISTDateTime(l.receivedAt)}</Td>
              {isAdmin && companies && <Td className="text-xs">{companies.get(l.clientId)}</Td>}
              <Td className="font-medium">
                {l.name ?? <span className="text-muted">—</span>}
                {l.replacesId && <div><Badge tone="violet">Replacement</Badge></div>}
                {l.replacedBy && <div><Badge>Replaced</Badge></div>}
              </Td>
              <Td className="whitespace-nowrap">
                {l.phone ? <a href={`tel:${l.phone}`} className="hover:underline">{l.phone}</a> : "—"}
                {l.phoneNormalized && <a className="ml-2 text-xs text-emerald-700 hover:underline" href={`https://wa.me/91${l.phoneNormalized}`} target="_blank" rel="noreferrer">WhatsApp</a>}
              </Td>
              <Td className="max-w-xs text-xs">
                {Object.entries(l.answers ?? {}).map(([k, v]) => <div key={k}><span className="text-muted">{k}:</span> {v}</div>)}
              </Td>
              <Td>
                {l.invoiceId ? (
                  <LeadStatusBadge status={l.status} />
                ) : (
                  <div className="flex flex-col gap-1">
                    <LeadStatusSelect id={l.id} status={l.status} options={Object.entries(LEAD_STATUS_LABEL) as [LeadStatus, string][]} />
                    {!isAdmin && inDisputeWindow(l, now) && <span className="text-[11px] text-muted">Mark Fake/Wrong within 48 h to exclude</span>}
                  </div>
                )}
              </Td>
              <Td className="text-xs">
                <Badge tone={billing === "Billable" || billing === "Invoiced" ? "green" : billing.startsWith("Pending") ? "amber" : "red"}>{billing.split(":")[0]}</Badge>
                {billing.includes(":") && <div className="mt-1 text-muted">{billing.split(": ")[1]}</div>}
              </Td>
              {isAdmin && (
                <Td className="whitespace-nowrap">
                  {!l.invoiceId && (
                    <ActionForm action={leadAction} hidden={{ id: l.id, op: "duplicate", value: String(!l.isDuplicate) }} className="inline">
                      <button className="text-xs text-muted hover:underline">{l.isDuplicate ? "Not a duplicate" : "Mark duplicate"}</button>
                    </ActionForm>
                  )}
                  <div>
                    <ActionButton action={leadAction} hidden={{ id: l.id, op: "erase" }} variant="ghost" confirm="Delete this lead's personal data? This cannot be undone.">
                      <span className="text-xs text-red-600">Erase data</span>
                    </ActionButton>
                  </div>
                </Td>
              )}
            </tr>
          );
        })}
      </tbody>
    </Table>
  );
}
