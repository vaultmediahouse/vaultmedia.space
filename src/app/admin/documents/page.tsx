import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { DocStatus } from "@/components/status";
import { Badge, Card, Empty, LinkButton, PageHeader, Select, Table, Td, Th } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { DOC_STATE_LABEL, DOC_TYPE_LABEL, REQUIRED_DOCS } from "@/lib/templates";
import { formatISTDateTime } from "@/lib/week";
import { requiredDocsStatus } from "@/server/documents";

export const metadata: Metadata = { title: "Documents" };

export default async function AdminDocuments({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const clients = await db.select().from(schema.clients).where(eq(schema.clients.active, true));
  const docs = await db
    .select({ d: schema.documents, company: schema.clients.company })
    .from(schema.documents)
    .innerJoin(schema.clients, eq(schema.clients.id, schema.documents.clientId))
    .where(and(isNull(schema.documents.supersededBy), sp.client ? eq(schema.documents.clientId, sp.client) : undefined))
    .orderBy(desc(schema.documents.updatedAt));
  const checklists = await Promise.all(clients.map(async (c) => ({ c, items: await requiredDocsStatus(c.id) })));
  // Admin-only view of what still has to go out (the client portal never shows unsent documents).
  const drafts = await db
    .select({ id: schema.documents.id, clientId: schema.documents.clientId, type: schema.documents.type, title: schema.documents.title })
    .from(schema.documents)
    .where(and(eq(schema.documents.status, "draft"), isNull(schema.documents.supersededBy)));
  const pending = checklists.flatMap(({ c, items }) =>
    items
      .filter((i) => i.state === "missing" || i.state === "draft")
      .map((i) => ({ c, i, draft: drafts.find((d) => d.clientId === c.id && d.type === i.type) })),
  );

  return (
    <>
      <PageHeader title="Documents" subtitle="Contracts, SOWs, NDAs, DPAs and deposit invoices — created from templates, sent, tracked and e-accepted." actions={<><LinkButton href="/admin/documents/templates">Templates</LinkButton><LinkButton href="/admin/documents/new" variant="primary">New document</LinkButton></>} />
      <Card title={`Still to send (${pending.length})`} className="mb-6" actions={<LinkButton href="/admin/settings#documents">Choose documents per client</LinkButton>}>
        {pending.length === 0 ? <Empty>Every document that applies to your clients has been sent.</Empty> : (
          <Table>
            <thead><tr><Th>Client</Th><Th>Document</Th><Th>State</Th><Th></Th></tr></thead>
            <tbody>
              {pending.map(({ c, i, draft }) => (
                <tr key={`${c.id}-${i.type}`}>
                  <Td>{c.company}</Td>
                  <Td>{i.label}</Td>
                  <Td><Badge tone={i.state === "draft" ? "slate" : "red"}>{DOC_STATE_LABEL[i.state]}</Badge></Td>
                  <Td className="text-right">
                    {draft ? (
                      <Link className="text-sm font-medium underline" href={`/admin/documents/${draft.id}`}>Open draft and send</Link>
                    ) : (
                      <Link className="text-sm font-medium underline" href={`/admin/documents/new?client=${c.id}&type=${i.type}`}>Create</Link>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <Card title="Checklist per client" className="mb-6">
        {checklists.length === 0 ? <Empty>No active clients.</Empty> : (
          <Table>
            <thead><tr><Th>Client</Th>{REQUIRED_DOCS.map((t) => <Th key={t}>{DOC_TYPE_LABEL[t].split(" ")[0]}</Th>)}<Th>Progress</Th></tr></thead>
            <tbody>
              {checklists.map(({ c, items }) => {
                const done = items.filter((i) => i.state === "accepted").length;
                return (
                  <tr key={c.id}>
                    <Td><Link className="font-medium hover:underline" href={`/admin/documents?client=${c.id}`}>{c.company}</Link>{c.requireDocsBeforeWork && <div className="text-[11px] text-muted">Work blocked until Contract + SOW</div>}</Td>
                    {REQUIRED_DOCS.map((t) => {
                      const i = items.find((x) => x.type === t);
                      return <Td key={t}>{i ? <Badge tone={i.state === "accepted" ? "green" : i.state === "sent" ? "amber" : i.state === "draft" ? "slate" : "red"}>{DOC_STATE_LABEL[i.state]}</Badge> : <span className="text-xs text-muted">n/a</span>}</Td>;
                    })}
                    <Td>
                      {items.length > 0 ? (
                        <>
                          <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-emerald-500" style={{ width: `${(done / items.length) * 100}%` }} /></div>
                          <div className="text-xs text-muted">{done}/{items.length}</div>
                        </>
                      ) : <span className="text-xs text-muted">none required</span>}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
      <Card title="All documents" actions={
        <form action="/admin/documents" className="flex gap-2">
          <Select name="client" defaultValue={sp.client ?? ""} className="w-auto">
            <option value="">All clients</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.company}</option>)}
          </Select>
          <button className="rounded-md border border-border bg-white px-3 py-1.5 text-sm">Filter</button>
        </form>
      }>
        {docs.length === 0 ? <Empty>No documents yet. Create one from a template.</Empty> : (
          <Table>
            <thead><tr><Th>Title</Th><Th>Client</Th><Th>Type</Th><Th>Version</Th><Th>Status</Th><Th>Last change</Th></tr></thead>
            <tbody>
              {docs.map(({ d, company }) => (
                <tr key={d.id} className="hover:bg-slate-50">
                  <Td><Link className="font-medium hover:underline" href={`/admin/documents/${d.id}`}>{d.title}</Link></Td>
                  <Td>{company}</Td>
                  <Td>{DOC_TYPE_LABEL[d.type]}</Td>
                  <Td>v{d.version}</Td>
                  <Td><DocStatus status={d.status} /></Td>
                  <Td className="text-xs">{formatISTDateTime(d.acceptedAt ?? d.viewedAt ?? d.sentAt ?? d.updatedAt)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
