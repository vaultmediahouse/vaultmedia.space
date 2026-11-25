import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import { Card, PageHeader, Select, Table, Td, Th } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { formatISTDateTime } from "@/lib/week";

export const metadata: Metadata = { title: "Audit log" };

const LINK: Record<string, (id: string) => string> = {
  work_item: (id) => `/admin/work/${id}`,
  invoice: (id) => `/admin/billing/${id}`,
  document: (id) => `/admin/documents/${id}`,
  client: (id) => `/admin/clients/${id}`,
};

export default async function ActivityPage({ searchParams }: { searchParams: Promise<{ entity?: string; client?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const conds: SQL[] = [];
  if (sp.entity) conds.push(eq(schema.activityLog.entity, sp.entity));
  if (sp.client) conds.push(eq(schema.activityLog.clientId, sp.client));
  const rows = await db
    .select({ a: schema.activityLog, user: schema.users.name, username: schema.users.username })
    .from(schema.activityLog)
    .leftJoin(schema.users, eq(schema.users.id, schema.activityLog.userId))
    .where(and(...conds))
    .orderBy(desc(schema.activityLog.createdAt))
    .limit(300);
  const clients = await db.select({ id: schema.clients.id, company: schema.clients.company }).from(schema.clients);
  const companies = new Map(clients.map((c) => [c.id, c.company]));
  return (
    <>
      <PageHeader title="Audit log" subtitle="Every approval, edit, document acceptance and billing change, with user, time and IP." />
      <Card actions={
        <form action="/admin/activity" className="flex gap-2">
          <Select name="entity" defaultValue={sp.entity ?? ""} className="w-auto">
            <option value="">All</option>
            {["work_item", "invoice", "document", "lead", "client", "user", "rate_card", "settings"].map((e) => <option key={e} value={e}>{e.replace("_", " ")}</option>)}
          </Select>
          <Select name="client" defaultValue={sp.client ?? ""} className="w-auto">
            <option value="">All clients</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.company}</option>)}
          </Select>
          <button className="rounded-md border border-border bg-white px-3 py-1.5 text-sm">Filter</button>
        </form>
      } title="Latest 300 entries">
        <Table>
          <thead><tr><Th>When (IST)</Th><Th>Who</Th><Th>Client</Th><Th>What</Th><Th>Change</Th><Th>IP</Th></tr></thead>
          <tbody>
            {rows.map(({ a, user, username }) => (
              <tr key={a.id}>
                <Td className="whitespace-nowrap text-xs">{formatISTDateTime(a.createdAt)}</Td>
                <Td className="text-xs">{user ? `${user} (@${username})` : "System"}</Td>
                <Td className="text-xs">{a.clientId ? companies.get(a.clientId) : ""}</Td>
                <Td className="text-xs">
                  {a.entityId && LINK[a.entity] ? <Link className="hover:underline" href={LINK[a.entity](a.entityId)}>{a.entity}</Link> : a.entity} · <span className="font-medium">{a.action}</span>
                </Td>
                <Td className="max-w-md text-[11px] text-muted"><code className="break-all">{a.after ? JSON.stringify(a.after).slice(0, 220) : ""}</code></Td>
                <Td className="text-xs">{a.ip}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
