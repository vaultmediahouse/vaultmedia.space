/**
 * Document templates (PRD §7). Markdown with {{variables}}; seeded into doc_templates by
 * `npm run db:seed` and editable in Admin → Documents → Templates.
 *
 * IMPORTANT: these are starting points written for an Indian freelance agency. Have a lawyer
 * review them once before real use (PRD §7 note). They are not legal advice.
 */
import type { DocType } from "@/db/schema";

export const DOC_TYPE_LABEL: Record<DocType, string> = {
  contract: "Freelance Agreement",
  sow: "Statement of Work",
  nda: "NDA",
  dpa: "Data Processing Agreement",
  deposit: "Deposit Invoice + Payment Schedule",
  other: "Other",
};

/** Documents every client should have accepted (PRD §7 required-docs checklist). */
export const REQUIRED_DOCS: DocType[] = ["contract", "sow", "nda", "dpa", "deposit"];

/** Admin-side wording for a document checklist state. */
export const DOC_STATE_LABEL: Record<"accepted" | "sent" | "draft" | "missing", string> = {
  accepted: "accepted",
  sent: "sent, waiting",
  draft: "draft, not sent",
  missing: "not created",
};

/** Documents that gate new Work Items when the client's requireDocsBeforeWork rule is on. */
export const GATING_DOCS: DocType[] = ["contract", "sow"];

export const TEMPLATE_VARIABLES: { key: string; label: string }[] = [
  { key: "agency_name", label: "Agency name" },
  { key: "agency_address", label: "Agency address" },
  { key: "agency_gstin", label: "Agency GSTIN" },
  { key: "client_name", label: "Client company" },
  { key: "client_contact", label: "Client contact person" },
  { key: "client_address", label: "Client address" },
  { key: "client_gst", label: "Client GST no." },
  { key: "start_date", label: "Start date" },
  { key: "today", label: "Today's date" },
  { key: "rate_image", label: "Image creative rate" },
  { key: "rate_video", label: "Video creative rate" },
  { key: "lead_rate", label: "Qualified lead rate" },
  { key: "revision_rate", label: "Extra revision rate" },
  { key: "setup_fee", label: "Setup fee" },
  { key: "free_revisions", label: "Free revisions per creative" },
  { key: "max_video_seconds", label: "Max video length (sec)" },
  { key: "payment_window_days", label: "Payment window (days)" },
  { key: "cutoff_time", label: "Weekly cut-off" },
  { key: "auto_accept_hours", label: "Auto-accept window (hours)" },
  { key: "jurisdiction", label: "Jurisdiction" },
  { key: "upi_id", label: "UPI ID" },
  { key: "bank_details", label: "Bank details" },
  { key: "deposit_amount", label: "Deposit amount" },
];

/** Replace {{var}} with values; unknown variables are left visible so they get noticed. */
export function renderTemplate(body: string, vars: Record<string, string>): string {
  return body.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (m, k: string) =>
    vars[k] !== undefined && vars[k] !== "" ? vars[k] : m,
  );
}

export function unfilledVariables(body: string): string[] {
  return [...new Set([...body.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/g)].map((m) => m[1]))];
}

export const DEFAULT_TEMPLATES: { type: DocType; name: string; body: string }[] = [
  {
    type: "contract",
    name: "Freelance Agreement",
    body: `# Freelance Services Agreement

**Date:** {{today}}

**Between:** {{agency_name}}, {{agency_address}} ("Agency")
**And:** {{client_name}}, {{client_address}}, represented by {{client_contact}} ("Client")

## 1. Services
The Agency will provide digital marketing services to the Client: ad creatives (static images and short videos) and qualified enquiry leads, as described in the Statement of Work (SOW) agreed through the Client Portal. The SOW forms part of this Agreement.

## 2. Term
This Agreement starts on {{start_date}} and continues until either party ends it under clause 10.

## 3. Work Items and approval
Every unit of work is recorded in the Client Portal as a Work Item. A Work Item becomes billable only after both the Agency and the Client have approved it in the portal ("Sanctioned"), and the delivery has been accepted. A delivery not accepted or disputed within {{auto_accept_hours}} hours is treated as accepted.

## 4. Fees
| Item | Rate |
| --- | --- |
| Creative: static image | {{rate_image}} per creative |
| Creative: video / animated (up to {{max_video_seconds}} sec) | {{rate_video}} per creative |
| Qualified lead (as defined in the SOW) | {{lead_rate}} per lead |
| Extra revision beyond {{free_revisions}} free revisions | {{revision_rate}} per revision |

Fees are exclusive of GST, which is added where applicable. Advertising budgets are paid by the Client directly to the ad platform from the Client's own ad account and are not part of these fees.

## 5. Billing and payment
Billing is weekly. Approved and accepted work up to the cut-off ({{cutoff_time}}) is invoiced the following Monday. Invoices are payable within {{payment_window_days}} days by UPI ({{upi_id}}) or bank transfer. If an invoice is unpaid after the due date, the Agency may pause new creative work until it is cleared.

## 6. Revisions
Each creative includes {{free_revisions}} free revisions. Further revisions are charged at {{revision_rate}} each and are proposed in the portal for approval before work starts.

## 7. Intellectual property
On full payment for a creative, ownership of the final delivered creative passes to the Client. The Agency keeps ownership of drafts, working files, templates and know-how, and may show delivered work in its portfolio unless the Client objects in writing.

## 8. Confidentiality
Each party will keep the other's non-public business information confidential and use it only for this Agreement. This survives termination for two (2) years.

## 9. Data protection
Leads contain personal data. Both parties will handle it lawfully, including under India's Digital Personal Data Protection Act, 2023, as set out in the Data Processing Agreement.

## 10. Termination
Either party may end this Agreement with seven (7) days' written notice (email or WhatsApp is sufficient). The Client pays for all work sanctioned and delivered up to the termination date.

## 11. Limitation of liability
The Agency does not guarantee specific sales results from leads or creatives. The Agency's total liability under this Agreement is limited to the fees paid in the four (4) weeks before the claim.

## 12. Disputes
The parties will first try to resolve any dispute in good faith within fifteen (15) days. Failing that, the courts at {{jurisdiction}} have exclusive jurisdiction.

---
Accepted electronically through the Vault Media House Client Portal. Acceptance records the name, date, time and IP address of the person accepting.
`,
  },
  {
    type: "sow",
    name: "Statement of Work",
    body: `# Statement of Work

**Client:** {{client_name}}
**Agency:** {{agency_name}}
**Effective from:** {{start_date}}

## 1. Deliverables
| Deliverable | Unit | Rate | Notes |
| --- | --- | --- | --- |
| Static image creative | per creative | {{rate_image}} | Includes {{free_revisions}} revisions |
| Video / animated creative | per creative | {{rate_video}} | Up to {{max_video_seconds}} seconds; includes {{free_revisions}} revisions |
| Interested lead | per qualified lead | {{lead_rate}} | See definition in section 2 |
| Extra revision | per revision | {{revision_rate}} | Only when proposed and approved in the portal |

Quantities are not fixed in advance. Each creative or batch is requested as a Work Item in the portal and needs approval from both parties before work starts. Leads are billed for the number actually delivered and qualified in each week.

## 2. Qualified lead definition
A lead is billable at {{lead_rate}} only when it has all of the following:
1. a valid, reachable phone number;
2. a name;
3. the business or use-case answer from the lead form;
4. it is not a duplicate of a lead delivered in the previous 30 days;
5. it is not marked "Fake" or "Wrong Number" by the Client in the portal within 48 hours of delivery.

Leads marked Fake or Wrong Number within 48 hours are not billed. Where the Agency supplies a replacement, the replacement is billed once and the original is never billed.

## 3. Weekly cycle
| When | What happens |
| --- | --- |
| Monday to Sunday | Work Items and leads accumulate; the Client reviews and approves in the portal |
| {{cutoff_time}} | Cut-off: only approved and accepted items count for the week |
| Monday | Invoice generated and shared (portal + WhatsApp/Telegram link + PDF) |
| Within {{payment_window_days}} days | Payment due |
| After the due date | Reminder; new creative work paused until cleared |

## 4. Out of scope
- Ad spend (paid by the Client directly to the ad platform).
- Running or managing the Client's ad account, unless agreed separately.
- Printing, photography or video shoots, influencer fees, and stock assets with paid licences.
- Sales follow-up and conversion of leads.

## 5. Client responsibilities
- Provide brand assets, product details and approvals in the portal on time.
- Review delivered leads within 48 hours and mark Fake / Wrong Number leads promptly.
`,
  },
  {
    type: "nda",
    name: "Mutual NDA",
    body: `# Mutual Non-Disclosure Agreement

**Date:** {{today}}
**Parties:** {{agency_name}} and {{client_name}} (each a "Party").

## 1. Confidential information
Any non-public information one Party shares with the other, including customer lists, leads, pricing, product plans, ad account data and creative briefs, in any form.

## 2. Obligations
The receiving Party will (a) use the information only to perform or evaluate the services between the Parties, (b) not disclose it to anyone except employees or contractors who need it and are bound by similar duties, and (c) protect it with at least reasonable care.

## 3. Exclusions
Information that is public through no fault of the receiving Party, already known to it, independently developed, or that must be disclosed by law (with prompt notice to the other Party where allowed).

## 4. Term
This Agreement lasts for the duration of the business relationship and for two (2) years after it ends.

## 5. Return or deletion
On request, the receiving Party will return or delete the confidential information, except copies it must keep by law.

## 6. Governing law
Laws of India; courts at {{jurisdiction}}.
`,
  },
  {
    type: "dpa",
    name: "Data Processing Agreement",
    body: `# Data Processing Agreement

**Between:** {{client_name}} ("Data Fiduciary") and {{agency_name}} ("Data Processor")
**Date:** {{today}}

This Agreement covers the personal data of prospective customers ("leads") that the Agency collects or processes for the Client. It is intended to align with India's Digital Personal Data Protection Act, 2023 (DPDP Act) and general privacy practice.

## 1. Data categories
Name, phone number, city or location, and answers to lead-form questions (for example business type or use case). No sensitive data (financial, health, government ID) is collected.

## 2. Purpose
Only to deliver enquiry leads to the Client so the Client can contact the person about its products. The Agency will not use lead data for any other purpose or sell it.

## 3. Notice and consent
Lead forms will show a clear notice of who is collecting the data and why, and collect consent before submission.

## 4. Security measures
- Access to the Client Portal is restricted by individual logins; each client sees only its own data.
- Passwords are stored hashed; connections are encrypted (HTTPS).
- File links are signed and expire.
- Access to leads is logged.

## 5. Retention
The Agency keeps lead data in the portal for up to 12 months after delivery, or less if the Client asks, then deletes it. The Client is responsible for data it exports or copies into its own systems.

## 6. Data principal requests
If a person asks to access, correct or delete their data, the party receiving the request informs the other within 7 days, and the Agency deletes or corrects the record in the portal.

## 7. Breach notification
The Agency will inform the Client without undue delay (and within 72 hours where possible) after becoming aware of a personal data breach affecting lead data.

## 8. Sub-processors
The Agency may use hosting, database and email providers to run the portal. It will use reputable providers and remain responsible for them.
`,
  },
  {
    type: "deposit",
    name: "Deposit Invoice + Payment Schedule",
    body: `# Deposit Invoice and Payment Schedule

**To:** {{client_name}}, {{client_address}}
**GST no.:** {{client_gst}}
**From:** {{agency_name}}, GSTIN {{agency_gstin}}
**Date:** {{today}}

## Deposit
| Item | Amount |
| --- | --- |
| One-time setup and onboarding (account setup, lead form, tracking) | {{setup_fee}} |
| Advance deposit against first weeks of work | {{deposit_amount}} |

The deposit is due before work starts and is adjusted against the first weekly invoices.

## Payment schedule
- Weekly invoices are issued every Monday for approved work up to {{cutoff_time}}.
- Each invoice is payable within {{payment_window_days}} days.
- Pay by UPI to **{{upi_id}}** or bank transfer:

{{bank_details}}

Please upload the payment reference (UTR) in the portal under Billing after paying.
`,
  },
];
