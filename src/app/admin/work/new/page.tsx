import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { Card, Empty, LinkButton, PageHeader } from "@/components/ui";
import { NewItemForm } from "@/components/work/new-item-form";
import { requireAdmin } from "@/lib/auth";
import { getRateCard } from "@/server/rate-cards";

export const metadata: Metadata = { title: "New work item" };

export default async function NewWorkItemPage({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  await requireAdmin();
  const { client } = await searchParams;
  const clients = await db.select({ id: schema.clients.id, company: schema.clients.company }).from(schema.clients).where(eq(schema.clients.active, true));
  if (!clients.length) {
    return <><PageHeader title="New work item" /><Empty>Add a client first. <LinkButton href="/admin/clients/new">Add client</LinkButton></Empty></>;
  }
  const rates = Object.fromEntries(await Promise.all(clients.map(async (c) => [c.id, await getRateCard(c.id)] as const)));
  return (
    <>
      <PageHeader title="New work item" subtitle="Creatives, lead batches or any other billable task." />
      <Card className="max-w-3xl">
        <NewItemForm isAdmin clients={clients} rates={rates} defaultClientId={client} />
      </Card>
    </>
  );
}
