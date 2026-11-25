import type { Metadata } from "next";
import Link from "next/link";
import { db, schema } from "@/db";
import { Card, PageHeader, Table, Td, Th } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { DOC_TYPE_LABEL } from "@/lib/templates";
import { formatISTDateTime } from "@/lib/week";

export const metadata: Metadata = { title: "Templates" };

export default async function TemplatesPage() {
  await requireAdmin();
  const templates = await db.select().from(schema.docTemplates).orderBy(schema.docTemplates.type);
  return (
    <>
      <PageHeader title="Document templates" subtitle="Edit the wording once; new documents start from these. Already-created documents don't change." actions={<Link href="/admin/documents" className="text-sm text-muted hover:underline">← Documents</Link>} />
      <Card>
        <Table>
          <thead><tr><Th>Name</Th><Th>Type</Th><Th>Variables</Th><Th>Updated</Th></tr></thead>
          <tbody>
            {templates.map((t) => (
              <tr key={t.id}>
                <Td><Link className="font-medium hover:underline" href={`/admin/documents/templates/${t.id}`}>{t.name}</Link></Td>
                <Td>{DOC_TYPE_LABEL[t.type]}</Td>
                <Td className="text-xs text-muted">{t.variables.length}</Td>
                <Td className="text-xs">{formatISTDateTime(t.updatedAt)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
        <p className="mt-3 text-xs text-muted">Templates are starting points. Have a lawyer review them once before use.</p>
      </Card>
    </>
  );
}
