import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { InvoiceView } from "@/components/invoice-view";
import { requireAdmin } from "@/lib/auth";

export const metadata: Metadata = { title: "Invoice" };

export default async function AdminInvoice({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const inv = await db.query.invoices.findFirst({ where: eq(schema.invoices.id, id) });
  if (!inv) notFound();
  return <InvoiceView inv={inv} user={user} />;
}
