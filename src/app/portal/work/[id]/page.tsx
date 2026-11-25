import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { ItemDetail } from "@/components/work/item-detail";
import { requireClient } from "@/lib/auth";

export const metadata: Metadata = { title: "Work item" };

export default async function PortalWorkItem({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireClient();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  // Data isolation: only this client's items are visible.
  const item = await db.query.workItems.findFirst({ where: and(eq(schema.workItems.id, id), eq(schema.workItems.clientId, user.clientId)) });
  if (!item) notFound();
  return <ItemDetail item={item} user={user} base="/portal/work" />;
}
