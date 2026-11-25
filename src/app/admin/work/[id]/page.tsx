import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { ItemDetail } from "@/components/work/item-detail";
import { requireAdmin } from "@/lib/auth";

export const metadata: Metadata = { title: "Work item" };

export default async function AdminWorkItem({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const item = await db.query.workItems.findFirst({ where: eq(schema.workItems.id, id) });
  if (!item) notFound();
  return <ItemDetail item={item} user={user} base="/admin/work" />;
}
