import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { invoicePdf } from "@/server/pdf";

export async function GET(_req: Request, ctx: RouteContext<"/api/invoices/[id]/pdf">) {
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in first", { status: 401 });
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Not found", { status: 404 });
  const inv = await db.query.invoices.findFirst({ where: eq(schema.invoices.id, id) });
  if (!inv || (user.role === "client" && inv.clientId !== user.clientId)) return new Response("Not found", { status: 404 });
  const [lines, client, settings] = await Promise.all([
    // Same order as the invoice page: work items, leads, then adjustments.
    db.select().from(schema.invoiceLines).where(eq(schema.invoiceLines.invoiceId, id)).orderBy(desc(schema.invoiceLines.kind)),
    db.query.clients.findFirst({ where: eq(schema.clients.id, inv.clientId) }),
    getSettings(),
  ]);
  const pdf = await invoicePdf(inv, lines, client!, settings);
  return new Response(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${inv.number}.pdf"`, "Cache-Control": "private, no-store" },
  });
}
