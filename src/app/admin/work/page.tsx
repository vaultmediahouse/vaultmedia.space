import type { Metadata } from "next";
import { LinkButton, PageHeader } from "@/components/ui";
import { WorkList, type WorkFilters } from "@/components/work/work-list";
import { requireAdmin } from "@/lib/auth";
import { clientOptions } from "@/server/queries";

export const metadata: Metadata = { title: "Work Items" };

export default async function AdminWorkPage({ searchParams }: { searchParams: Promise<WorkFilters> }) {
  const user = await requireAdmin();
  const filters = await searchParams;
  const clients = await clientOptions();
  return (
    <>
      <PageHeader
        title="Work Items"
        actions={<><a className="rounded-md border border-border bg-white px-3 py-2 text-sm hover:bg-slate-50" href={`/api/export/work?${new URLSearchParams(filters as Record<string, string>).toString()}`}>Export CSV</a><LinkButton href="/admin/work/new" variant="primary">New work item</LinkButton></>}
      />
      <WorkList user={user} base="/admin/work" filters={filters} clients={clients} />
    </>
  );
}
