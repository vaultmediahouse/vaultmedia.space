import Link from "next/link";
import { asc, desc, eq, and, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import type { User, WorkItem } from "@/db/schema";
import { ActionButton, ActionForm, SubmitButton } from "../action-form";
import { WorkStatus } from "../status";
import { Badge, Card, DL, Field, Input, PageHeader, Textarea } from "../ui";
import { workItemAction } from "@/actions/work";
import { formatINR, paiseToRupeesInput } from "@/lib/money";
import { formatISTDate, formatISTDateTime, istDate } from "@/lib/week";
import { canTransition, EDITABLE, isOverdue, STATUS_LABEL, TYPE_LABEL } from "@/lib/workflow";
import { signedFileUrl } from "@/lib/storage";
import { getRateCard } from "@/server/rate-cards";

/**
 * Work Item detail with approval panel, actions, files, comments and history.
 * Shared by /admin/work/[id] and /portal/work/[id]; buttons shown depend on role + status, and
 * the server re-checks everything on submit.
 */
export async function ItemDetail({ item, user, base }: { item: WorkItem; user: User; base: string }) {
  const role = user.role;
  const [client, rc, files, comments, history, people] = await Promise.all([
    db.query.clients.findFirst({ where: eq(schema.clients.id, item.clientId) }),
    getRateCard(item.clientId),
    db.select().from(schema.attachments).where(eq(schema.attachments.workItemId, item.id)).orderBy(asc(schema.attachments.createdAt)),
    db.select().from(schema.comments).where(eq(schema.comments.workItemId, item.id)).orderBy(asc(schema.comments.createdAt)),
    db.select().from(schema.activityLog).where(and(eq(schema.activityLog.entity, "work_item"), eq(schema.activityLog.entityId, item.id))).orderBy(desc(schema.activityLog.createdAt)).limit(30),
    db.select({ id: schema.users.id, name: schema.users.name, role: schema.users.role }).from(schema.users),
  ]);
  const who = (id: string | null) => people.find((p) => p.id === id);
  const nameOf = (id: string | null) => {
    const p = who(id);
    if (!p) return id ? "Unknown" : "System";
    return p.role === "admin" ? `${p.name} (Vault Media House)` : p.name;
  };
  const parent = item.parentId ? await db.query.workItems.findFirst({ where: eq(schema.workItems.id, item.parentId) }) : null;
  const children = await db.select().from(schema.workItems).where(and(eq(schema.workItems.parentId, item.id), inArray(schema.workItems.status, ["proposed", "sanctioned", "in_progress", "delivered", "accepted", "billed", "paid"])));
  const hidden = { id: item.id };
  const myApproval = role === "admin" ? item.adminApprovedAt : item.clientApprovedAt;
  const isCreative = item.type === "image" || item.type === "video";
  const freeLeft = Math.max(0, rc.freeRevisions - item.revisionCount);
  const briefs = files.filter((f) => f.kind === "brief");
  const deliverables = files.filter((f) => f.kind === "deliverable");

  const fileLink = (f: (typeof files)[number]) =>
    f.storageKey ? signedFileUrl(f.storageKey, f.fileName ?? "file") : f.url ?? "#";

  return (
    <>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-2">#{item.number} {item.title} <WorkStatus status={item.status} /></span>}
        subtitle={<>{role === "admin" && client ? <Link className="hover:underline" href={`/admin/clients/${client.id}`}>{client.company}</Link> : null}{role === "admin" ? " · " : ""}{TYPE_LABEL[item.type]}</>}
        actions={<Link href={base} className="text-sm text-muted hover:underline">← All work</Link>}
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <Card title="Details">
            <DL
              items={[
                ["Quantity × rate", `${item.qty} × ${formatINR(item.rate)}`],
                ["Amount", <span key="a" className="text-base">{formatINR(item.amount)}</span>],
                ["Due date", <span key="due">{formatISTDate(item.dueDate)}{isOverdue(item, istDate(new Date())) && <span className="ml-2"><Badge tone="red">overdue</Badge></span>}</span>],
                ...(item.deliveredAt ? [["Delivered", formatISTDateTime(item.deliveredAt)] as [string, string]] : []),
                ...(item.acceptedAt ? [["Accepted", formatISTDateTime(item.acceptedAt)] as [string, string]] : []),
                ["Created by", `${nameOf(item.createdBy)} · ${formatISTDateTime(item.createdAt)}`],
                ...(isCreative ? [["Revisions", `${item.revisionCount} used · ${freeLeft} free left (then ${formatINR(rc.revisionRate)} each)`] as [string, string]] : []),
                ...(item.type === "video" ? [["Max length", `${rc.maxVideoSeconds} seconds`] as [string, string]] : []),
                ...(parent ? [["Revision of", <Link key="p" className="underline" href={`${base}/${parent.id}`}>#{parent.number} {parent.title}</Link>] as [string, React.ReactNode]] : []),
                ...(item.status === "rejected" ? [["Rejection reason", item.rejectionReason ?? ""] as [string, string]] : []),
                ...(item.invoiceId ? [["Invoice", <Link key="i" className="underline" href={`${role === "admin" ? "/admin" : "/portal"}/billing/${item.invoiceId}`}>View invoice</Link>] as [string, React.ReactNode]] : []),
              ]}
            />
            {item.brief && <p className="mt-4 whitespace-pre-wrap rounded-md bg-slate-50 p-3 text-sm">{item.brief}</p>}
            {children.length > 0 && (
              <div className="mt-3 text-sm">Paid revisions: {children.map((c) => <Link key={c.id} href={`${base}/${c.id}`} className="mr-2 underline">#{c.number} ({STATUS_LABEL[c.status]})</Link>)}</div>
            )}
          </Card>

          <Card title="Files">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <div className="mb-2 text-xs font-medium uppercase text-muted">Brief & references</div>
                <FileList files={briefs} link={fileLink} />
              </div>
              <div>
                <div className="mb-2 text-xs font-medium uppercase text-muted">Deliverables</div>
                <FileList files={deliverables} link={fileLink} />
              </div>
            </div>
            {(role === "admin" || !["paid", "cancelled"].includes(item.status)) && (
              <ActionForm action={workItemAction} hidden={{ ...hidden, op: "attach" }} resetOnSuccess className="mt-4 space-y-2 rounded-md bg-slate-50 p-3">
                <div className="grid gap-2 sm:grid-cols-[140px_1fr]">
                  <select name="kind" className="rounded-md border border-border bg-white px-2 py-2 text-sm" defaultValue={role === "admin" && ["in_progress", "revision_requested", "sanctioned"].includes(item.status) ? "deliverable" : "brief"}>
                    <option value="brief">Brief / reference</option>
                    {role === "admin" && <option value="deliverable">Deliverable</option>}
                  </select>
                  <Input type="file" name="file" />
                </div>
                <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                  <Input name="url" placeholder="…or paste a link (Drive, Canva, WeTransfer)" />
                  <Input name="label" placeholder="Link label (optional)" />
                  <SubmitButton variant="secondary">Add</SubmitButton>
                </div>
              </ActionForm>
            )}
          </Card>

          <Card title={`Comments (${comments.length})`}>
            {comments.length === 0 ? <p className="text-sm text-muted">No comments yet.</p> : (
              <ul className="space-y-3">
                {comments.map((c) => {
                  const p = who(c.userId);
                  return (
                    <li key={c.id} className={`rounded-md p-3 text-sm ${p?.role === "admin" ? "bg-gold-soft/60" : "bg-slate-50"}`}>
                      <div className="mb-1 text-xs text-muted">{nameOf(c.userId)} · {formatISTDateTime(c.createdAt)}</div>
                      <div className="whitespace-pre-wrap">{c.text}</div>
                    </li>
                  );
                })}
              </ul>
            )}
            <ActionForm action={workItemAction} hidden={{ ...hidden, op: "comment" }} resetOnSuccess className="mt-4 space-y-2">
              <Textarea name="text" rows={2} placeholder="Write a comment…" required />
              <SubmitButton variant="secondary">Post comment</SubmitButton>
            </ActionForm>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Approval">
            <ul className="space-y-2 text-sm">
              <ApprovalRow label="Vault Media House" at={item.adminApprovedAt} by={item.adminApprovedBy ? nameOf(item.adminApprovedBy) : item.adminApprovedAt ? "Auto-sanction" : null} />
              <ApprovalRow label={client?.company ?? "Client"} at={item.clientApprovedAt} by={item.clientApprovedBy ? nameOf(item.clientApprovedBy) : item.clientApprovedAt ? "Auto-sanction" : null} />
            </ul>
            {item.sanctionedAt && <p className="mt-3 text-xs text-muted">Sanctioned {formatISTDateTime(item.sanctionedAt)}</p>}
            <div className="mt-4 flex flex-col gap-2">
              {item.status === "draft" && <ActionButton action={workItemAction} hidden={{ ...hidden, op: "submit" }}>Submit for approval</ActionButton>}
              {item.status === "proposed" && !myApproval && (
                <>
                  <ActionButton action={workItemAction} hidden={{ ...hidden, op: "approve", seenQty: String(item.qty), seenRate: String(item.rate), seenAmount: String(item.amount) }} variant="gold">Approve {formatINR(item.amount)}</ActionButton>
                  <ActionForm action={workItemAction} hidden={{ ...hidden, op: "reject" }} className="space-y-2">
                    <Input name="reason" placeholder="Reason for rejecting" required />
                    <SubmitButton variant="secondary">Reject</SubmitButton>
                  </ActionForm>
                </>
              )}
              {item.status === "proposed" && myApproval && <p className="text-sm text-muted">You approved. Waiting for the other side.</p>}
            </div>
          </Card>

          <Card title="Next step">
            <div className="flex flex-col gap-2">
              {canTransition(item.status, "in_progress", role) && <ActionButton action={workItemAction} hidden={{ ...hidden, op: "transition", to: "in_progress" }}>Start work</ActionButton>}
              {canTransition(item.status, "delivered", role) && (
                <ActionButton action={workItemAction} hidden={{ ...hidden, op: "transition", to: "delivered" }} variant="gold">Mark delivered</ActionButton>
              )}
              {canTransition(item.status, "accepted", role) && (
                <ActionButton action={workItemAction} hidden={{ ...hidden, op: "transition", to: "accepted" }} variant="gold" confirm="Accept this delivery? It will be included in this week's invoice.">Accept delivery</ActionButton>
              )}
              {canTransition(item.status, "revision_requested", role) && isCreative && (
                <ActionForm action={workItemAction} hidden={{ ...hidden, op: "revision" }} className="space-y-2">
                  <Textarea name="note" rows={2} placeholder="What should change?" required />
                  <SubmitButton variant="secondary">{freeLeft > 0 ? `Request revision (${freeLeft} free left)` : `Request paid revision (${formatINR(rc.revisionRate)})`}</SubmitButton>
                </ActionForm>
              )}
              {item.status === "delivered" && role === "client" && (
                <p className="text-xs text-muted">If you don&apos;t respond, it is accepted automatically after the review window.</p>
              )}
              {canTransition(item.status, "cancelled", role) && (
                <ActionButton action={workItemAction} hidden={{ ...hidden, op: "transition", to: "cancelled" }} variant="ghost" confirm="Cancel this work item?">Cancel item</ActionButton>
              )}
              {["accepted", "billed", "paid", "rejected", "cancelled"].includes(item.status) && <p className="text-sm text-muted">No action needed.</p>}
            </div>
          </Card>

          {EDITABLE.includes(item.status) && (
            <Card title="Edit">
              <ActionForm action={workItemAction} hidden={{ ...hidden, op: "edit" }} className="space-y-3">
                <Field label="Title"><Input name="title" defaultValue={item.title} required /></Field>
                <Field label="Brief"><Textarea name="brief" rows={3} defaultValue={item.brief ?? ""} /></Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Qty"><Input name="qty" type="number" min={1} defaultValue={item.qty} /></Field>
                  <Field label="Rate (₹)">{role === "admin" ? <Input name="rate" inputMode="decimal" defaultValue={paiseToRupeesInput(item.rate)} /> : <Input disabled defaultValue={paiseToRupeesInput(item.rate)} />}</Field>
                </div>
                <Field label="Due date"><Input name="dueDate" type="date" defaultValue={item.dueDate ?? ""} /></Field>
                {item.status !== "draft" && <p className="text-xs text-amber-700">Changing title, brief, quantity or rate resets approvals: the other side must approve again.</p>}
                <SubmitButton variant="secondary">Save changes</SubmitButton>
              </ActionForm>
            </Card>
          )}

          <Card title="History">
            <ul className="space-y-2 text-xs">
              {history.map((h) => (
                <li key={h.id}>
                  <span className="font-medium">{h.action.replace(/_/g, " ").replace("status:", "→ ")}</span>
                  <span className="text-muted"> · {nameOf(h.userId)} · {formatISTDateTime(h.createdAt)}{role === "admin" && h.ip ? ` · ${h.ip}` : ""}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}

function ApprovalRow({ label, at, by }: { label: string; at: Date | null; by: string | null }) {
  return (
    <li className="flex items-start justify-between gap-2">
      <span>{label}</span>
      {at ? (
        <span className="text-right"><Badge tone="green">Approved</Badge><div className="text-xs text-muted">{by} · {formatISTDateTime(at)}</div></span>
      ) : (
        <Badge tone="amber">Pending</Badge>
      )}
    </li>
  );
}

function FileList({ files, link }: { files: { id: string; fileName: string | null; url: string | null; storageKey: string | null; sizeBytes: number | null; mimeType: string | null }[]; link: (f: never) => string }) {
  if (!files.length) return <p className="text-sm text-muted">None yet.</p>;
  return (
    <ul className="space-y-1 text-sm">
      {files.map((f) => {
        const href = link(f as never);
        const isImage = f.mimeType?.startsWith("image/") && f.storageKey;
        return (
          <li key={f.id}>
            {isImage && (
              // eslint-disable-next-line @next/next/no-img-element
              <a href={href} target="_blank" rel="noreferrer"><img src={href} alt={f.fileName ?? ""} className="mb-1 max-h-40 rounded border border-border" /></a>
            )}
            <a href={href} target="_blank" rel="noreferrer" className="break-all text-blue-700 hover:underline">{f.fileName ?? f.url}</a>
            {f.sizeBytes ? <span className="text-xs text-muted"> · {(f.sizeBytes / 1024).toFixed(0)} KB</span> : f.url ? <span className="text-xs text-muted"> · link</span> : null}
          </li>
        );
      })}
    </ul>
  );
}
