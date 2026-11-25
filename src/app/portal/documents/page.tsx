import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { DocStatus } from "@/components/status";
import { Badge, Card, Empty, PageHeader, Table, Td, Th } from "@/components/ui";
import { requireClient } from "@/lib/auth";
import { DOC_TYPE_LABEL } from "@/lib/templates";
import { formatISTDateTime } from "@/lib/week";
import { requiredDocsStatus } from "@/server/documents";

export const metadata: Metadata = { title: "Documents" };

export default async function PortalDocuments() {
  const user = await requireClient();
  const docs = await db
    .select()
    .from(schema.documents)
    .where(and(eq(schema.documents.clientId, user.clientId), inArray(schema.documents.status, ["sent", "viewed", "accepted", "expired"]), isNull(schema.documents.supersededBy)))
    .orderBy(desc(schema.documents.sentAt));
  const oldSigned = await db
    .select()
    .from(schema.documents)
    .where(and(eq(schema.documents.clientId, user.clientId), eq(schema.documents.status, "accepted")));
  const checklist = await requiredDocsStatus(user.clientId);
  const all = [...docs, ...oldSigned.filter((o) => !docs.some((d) => d.id === o.id))];
  return (
    <>
      <PageHeader title="Documents" subtitle="Agreements shared by Vault Media House. Review, accept and download them here." />
      <Card title="Checklist" className="mb-6">
        <div className="flex flex-wrap gap-2">
          {checklist.map((c) => <Badge key={c.type} tone={c.state === "accepted" ? "green" : c.state === "sent" ? "amber" : "slate"}>{c.label}: {c.state === "missing" || c.state === "draft" ? "not shared yet" : c.state === "sent" ? "waiting for you" : "accepted"}</Badge>)}
        </div>
      </Card>
      <Card>
        {all.length === 0 ? <Empty>No documents shared yet.</Empty> : (
          <Table>
            <thead><tr><Th>Document</Th><Th>Type</Th><Th>Version</Th><Th>Status</Th><Th>Date</Th></tr></thead>
            <tbody>
              {all.map((d) => (
                <tr key={d.id} className="hover:bg-slate-50">
                  <Td><Link className="font-medium hover:underline" href={`/portal/documents/${d.id}`}>{d.title}</Link></Td>
                  <Td>{DOC_TYPE_LABEL[d.type]}</Td>
                  <Td>v{d.version}</Td>
                  <Td><DocStatus status={d.status} /></Td>
                  <Td className="text-xs">{formatISTDateTime(d.acceptedAt ?? d.sentAt)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
