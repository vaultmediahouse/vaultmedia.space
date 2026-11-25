import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { DocEditor } from "@/components/doc-editor";
import { Card, PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { TEMPLATE_VARIABLES } from "@/lib/templates";

export const metadata: Metadata = { title: "Edit template" };

export default async function TemplatePage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const t = await db.query.docTemplates.findFirst({ where: eq(schema.docTemplates.id, id) });
  if (!t) notFound();
  return (
    <>
      <PageHeader title={`Template: ${t.name}`} actions={<Link href="/admin/documents/templates" className="text-sm text-muted hover:underline">← Templates</Link>} />
      <Card><DocEditor mode="template" id={t.id} title={t.name} content={t.body} variables={TEMPLATE_VARIABLES} /></Card>
    </>
  );
}
