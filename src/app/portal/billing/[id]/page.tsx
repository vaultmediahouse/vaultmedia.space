import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, eq, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import { InvoiceView } from "@/components/invoice-view";
import { requireClient } from "@/lib/auth";

export const metadata: Metadata = { title: "Invoice" };

export default async function PortalInvoice({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireClient();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const inv = await db.query.invoices.findFirst({ where: and(eq(schema.invoices.id, id), eq(schema.invoices.clientId, user.clientId), ne(schema.invoices.status, "void")) });
  if (!inv) notFound();
  return <InvoiceView inv={inv} user={user} />;
}
