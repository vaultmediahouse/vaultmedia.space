import type { Metadata } from "next";
import Link from "next/link";
import { asc, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { Badge, Card, Empty, LinkButton, PageHeader, Table, Td, Th } from "@/components/ui";
import { formatINR } from "@/lib/money";
import { outstandingByClient } from "@/server/billing";

export const metadata: Metadata = { title: "Clients" };

export default async function ClientsPage() {
  const clients = await db
    .select({
      c: schema.clients,
      users: sql<number>`(select count(*)::int from users u where u.client_id = ${schema.clients.id} and u.active)`,
      openItems: sql<number>`(select count(*)::int from work_items w where w.client_id = ${schema.clients.id} and w.status in ('proposed','sanctioned','in_progress','delivered','revision_requested'))`,
    })
    .from(schema.clients)
    .orderBy(asc(schema.clients.company));
  const outstanding = await outstandingByClient();
  return (
    <>
      <PageHeader title="Clients" actions={<LinkButton href="/admin/clients/new" variant="primary">Add client</LinkButton>} />
      <Card>
        {clients.length === 0 ? (
          <Empty>No clients yet. Add your first client to create their login.</Empty>
        ) : (
          <Table>
            <thead><tr><Th>Company</Th><Th>Contact</Th><Th>Logins</Th><Th>Open items</Th><Th>Outstanding</Th><Th>Status</Th></tr></thead>
            <tbody>
              {clients.map(({ c, users, openItems }) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <Td><Link className="font-medium hover:underline" href={`/admin/clients/${c.id}`}>{c.company}</Link><div className="text-xs text-muted">{c.city}</div></Td>
                  <Td>{c.contactName}<div className="text-xs text-muted">{c.phone}</div></Td>
                  <Td>{users}</Td>
                  <Td>{openItems}</Td>
                  <Td className="tabular-nums">{formatINR(outstanding.get(c.id) ?? 0)}</Td>
                  <Td>{c.active ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge>}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
