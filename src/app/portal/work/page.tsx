import type { Metadata } from "next";
import { LinkButton, PageHeader } from "@/components/ui";
import { WorkList, type WorkFilters } from "@/components/work/work-list";
import { requireClient } from "@/lib/auth";

export const metadata: Metadata = { title: "My Work" };

export default async function PortalWork({ searchParams }: { searchParams: Promise<WorkFilters> }) {
  const user = await requireClient();
  const filters = await searchParams;
  return (
    <>
      <PageHeader title="My Work" subtitle="Everything requested, approved, delivered and billed." actions={<LinkButton href="/portal/work/new" variant="primary">Request new work</LinkButton>} />
      <WorkList user={user} base="/portal/work" filters={{ ...filters, client: undefined }} />
    </>
  );
}
