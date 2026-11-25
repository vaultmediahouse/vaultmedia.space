import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { CopyButton } from "@/components/copy-button";
import { DocEditor } from "@/components/doc-editor";
import { DocStatus } from "@/components/status";
import { Card, DL, Input, PageHeader } from "@/components/ui";
import { documentAction } from "@/actions/documents";
import { requireAdmin } from "@/lib/auth";
import { renderMarkdown } from "@/lib/markdown";
import { signedFileUrl } from "@/lib/storage";
import { DOC_TYPE_LABEL } from "@/lib/templates";
import { formatISTDateTime } from "@/lib/week";

export const metadata: Metadata = { title: "Document" };

export default async function AdminDocument({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const doc = await db.query.documents.findFirst({ where: eq(schema.documents.id, id) });
  if (!doc) notFound();
  const client = await db.query.clients.findFirst({ where: eq(schema.clients.id, doc.clientId) });
  const versions = await db.select().from(schema.documents).where(eq(schema.documents.groupId, doc.groupId)).orderBy(desc(schema.documents.version));
  const log = await db.select().from(schema.activityLog).where(and(eq(schema.activityLog.entity, "document"), eq(schema.activityLog.entityId, id))).orderBy(desc(schema.activityLog.createdAt));
  const link = `${process.env.APP_URL ?? ""}/d/${doc.shareToken}`;
  const message = `Hi ${client?.contactName ?? ""}, please review and accept "${doc.title}" in the Vault Media House portal: ${link}`;
  const locked = doc.status === "accepted";
  const old = !!doc.supersededBy;

  return (
    <>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-2">{doc.title} <span className="text-sm font-normal text-muted">v{doc.version}</span> <DocStatus status={doc.status} /></span>}
        subtitle={<><Link className="hover:underline" href={`/admin/clients/${doc.clientId}`}>{client?.company}</Link> · {DOC_TYPE_LABEL[doc.type]}</>}
        actions={<><Link href="/admin/documents" className="px-2 py-2 text-sm text-muted hover:underline">← Documents</Link><a href={`/api/documents/${doc.id}/pdf`} className="rounded-md border border-border bg-white px-3 py-2 text-sm hover:bg-slate-50">Export PDF</a></>}
      />
      {old && <p className="mb-4 rounded-md bg-amber-50 p-3 text-sm text-amber-900">This is an older version. <Link className="underline" href={`/admin/documents/${doc.supersededBy}`}>Open the latest version</Link>.</p>}
      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <Card title={locked ? "Signed content (locked)" : "Edit"}>
          {locked || old ? (
            <>
              <div className="prose-doc" dangerouslySetInnerHTML={{ __html: renderMarkdown(doc.content) }} />
              {locked && !old && (
                <details className="mt-6 border-t border-border pt-4">
                  <summary className="cursor-pointer text-sm font-medium">Make changes (creates version {doc.version + 1})</summary>
                  <div className="mt-4"><DocEditor mode="document" id={doc.id} title={doc.title} content={doc.content} locked /></div>
                </details>
              )}
            </>
          ) : (
            <DocEditor mode="document" id={doc.id} title={doc.title} content={doc.content} />
          )}
        </Card>
        <div className="space-y-6">
          <Card title="Status">
            <DL items={[
              ["Created", formatISTDateTime(doc.createdAt)],
              ["Sent", formatISTDateTime(doc.sentAt)],
              ["Viewed", formatISTDateTime(doc.viewedAt)],
              ["Accepted", formatISTDateTime(doc.acceptedAt)],
              ...(doc.acceptedAt ? [["Signed as", doc.acceptedName ?? ""], ["IP", doc.acceptedIp ?? ""]] as [string, string][] : []),
              ...(doc.expiresAt ? [["Expires", doc.expiresAt]] as [string, string][] : []),
            ]} />
            {doc.signedStorageKey && <a className="mt-3 block text-sm text-blue-700 underline" href={signedFileUrl(doc.signedStorageKey, `${doc.title}-signed.pdf`)}>Signed PDF uploaded by client</a>}
          </Card>
          {!locked && !old && doc.status !== "archived" && (
            <Card title={doc.status === "draft" ? "Send to client" : "Resend"}>
              <ActionForm action={documentAction} hidden={{ id: doc.id, op: "send" }} className="space-y-2">
                <label className="block text-xs text-muted">Expires on (optional)<Input type="date" name="expiresAt" defaultValue={doc.expiresAt ?? ""} /></label>
                <SubmitButton variant="gold">{doc.status === "draft" ? "Send" : "Send again"}</SubmitButton>
              </ActionForm>
            </Card>
          )}
          {doc.status !== "draft" && (
            <Card title="Share link">
              <p className="mb-2 text-xs text-muted">The client signs in, then sees the document.</p>
              <pre className="mb-2 whitespace-pre-wrap rounded-md bg-slate-50 p-2 font-sans text-xs">{message}</pre>
              <div className="flex flex-wrap gap-2 text-sm">
                <CopyButton text={message} label="Copy message" />
                <a className="font-medium text-emerald-700 underline" target="_blank" rel="noreferrer" href={`https://wa.me/?text=${encodeURIComponent(message)}`}>WhatsApp</a>
                <a className="font-medium text-sky-700 underline" target="_blank" rel="noreferrer" href={`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(message)}`}>Telegram</a>
              </div>
            </Card>
          )}
          <Card title="Versions">
            <ul className="space-y-1 text-sm">
              {versions.map((v) => (
                <li key={v.id} className="flex justify-between">
                  <Link href={`/admin/documents/${v.id}`} className={v.id === doc.id ? "font-semibold" : "hover:underline"}>v{v.version}</Link>
                  <DocStatus status={v.status} />
                </li>
              ))}
            </ul>
          </Card>
          <Card title="Activity">
            <ul className="space-y-1 text-xs">{log.map((l) => <li key={l.id}><span className="font-medium">{l.action}</span> <span className="text-muted">· {formatISTDateTime(l.createdAt)} · {l.ip}</span></li>)}</ul>
          </Card>
          {!locked && doc.status !== "archived" && (
            <ActionForm action={documentAction} hidden={{ id: doc.id, op: "archive" }} confirm="Archive this document? The client will no longer see it.">
              <SubmitButton variant="ghost">Archive</SubmitButton>
            </ActionForm>
          )}
        </div>
      </div>
    </>
  );
}
