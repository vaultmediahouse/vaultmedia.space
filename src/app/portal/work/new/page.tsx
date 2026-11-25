import type { Metadata } from "next";
import { Card, PageHeader } from "@/components/ui";
import { NewItemForm } from "@/components/work/new-item-form";
import { requireClient } from "@/lib/auth";
import { getRateCard } from "@/server/rate-cards";
import { clientHasOverdueInvoice } from "@/server/billing";
import { clientIsBlockedByDocs } from "@/server/documents";

export const metadata: Metadata = { title: "Request new work" };

export default async function PortalNewWork() {
  const user = await requireClient();
  const [rc, overdue, blocked] = await Promise.all([getRateCard(user.clientId), clientHasOverdueInvoice(user.clientId), clientIsBlockedByDocs(user.clientId)]);
  return (
    <>
      <PageHeader title="Request new work" subtitle="Tell us what you need. Your request counts as your approval; work starts once Vault Media House approves it." />
      {(overdue || blocked) && (
        <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-800">
          {blocked ? "New work starts after the Contract and SOW are accepted (see Documents)." : "New creative requests are paused until the overdue invoice is cleared."}
        </p>
      )}
      <Card className="max-w-3xl">
        <NewItemForm isAdmin={false} clients={[{ id: user.clientId, company: "" }]} rates={{ [user.clientId]: rc }} defaultClientId={user.clientId} />
      </Card>
    </>
  );
}
