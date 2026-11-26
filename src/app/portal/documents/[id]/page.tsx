import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { DocFileView } from "@/components/doc-file-view";
import { DocStatus } from "@/components/status";
import { Card, Input, PageHeader } from "@/components/ui";
import { acceptDocumentAction } from "@/actions/documents";
import { requireClient } from "@/lib/auth";
import { renderMarkdown } from "@/lib/markdown";
import { formatISTDateTime } from "@/lib/week";
import { markViewed } from "@/server/documents";

export const metadata: Metadata = { title: "Document" };

export default async function PortalDocument({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireClient();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  let doc;
  try {
    doc = await markViewed(user, id); // records "Viewed" the first time
  } catch {
    notFound();
  }
  const canAccept = doc.status === "sent" || doc.status === "viewed";
  return (
    <>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-2">{doc.title} <span className="text-sm font-normal text-muted">v{doc.version}</span> <DocStatus status={doc.status} /></span>}
        actions={<><Link href="/portal/documents" className="px-2 py-2 text-sm text-muted hover:underline">← Documents</Link><a href={`/api/documents/${doc.id}/pdf`} className="rounded-md bg-ink px-3 py-2 text-sm font-medium text-white">{doc.format === "file" ? "Download" : "Download PDF"}</a></>}
      />
      {doc.supersededBy && <p className="mb-4 rounded-md bg-amber-50 p-3 text-sm text-amber-900">A newer version of this document exists.</p>}
      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <Card>{doc.format === "file" ? <DocFileView doc={doc} /> : <div className="prose-doc" dangerouslySetInnerHTML={{ __html: renderMarkdown(doc.content) }} />}</Card>
        <div>
          {canAccept ? (
            <Card title="Accept this document">
              <ActionForm action={acceptDocumentAction} hidden={{ id: doc.id }} className="space-y-3">
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" name="agree" required className="mt-1" />
                  <span>I have read this document and agree to it on behalf of my company.</span>
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium">Type your full name to sign</span>
                  <Input name="typedName" required minLength={3} autoComplete="name" defaultValue="" placeholder={user.name} />
                </label>
                <label className="block text-xs text-muted">
                  Optional: upload a signed PDF copy
                  <Input type="file" name="signedPdf" accept="application/pdf" className="mt-1" />
                </label>
                <p className="text-xs text-muted">Your name, the date and time, and your IP address are recorded. Once accepted, this version can&apos;t be changed.</p>
                <SubmitButton variant="gold">Accept and sign</SubmitButton>
              </ActionForm>
            </Card>
          ) : doc.status === "accepted" ? (
            <Card title="Accepted">
              <p className="text-sm">Signed by <strong>{doc.acceptedName}</strong> on {formatISTDateTime(doc.acceptedAt)} IST.</p>
            </Card>
          ) : (
            <Card title="Status"><p className="text-sm text-muted">This document is {doc.status}. Contact Vault Media House if you need a fresh copy.</p></Card>
          )}
        </div>
      </div>
    </>
  );
}
