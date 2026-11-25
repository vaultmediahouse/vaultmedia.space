import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireClient } from "@/lib/auth";
import { Shell, CLIENT_NAV } from "@/components/shell";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await requireClient();
  const client = await db.query.clients.findFirst({ where: eq(schema.clients.id, user.clientId) });
  return (
    <Shell user={user} nav={CLIENT_NAV} subtitle={client?.company}>
      {children}
    </Shell>
  );
}
