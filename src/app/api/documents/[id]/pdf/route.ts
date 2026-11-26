import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { signedFileUrl } from "@/lib/storage";
import { documentPdf } from "@/server/pdf";

export async function GET(req: Request, ctx: RouteContext<"/api/documents/[id]/pdf">) {
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in first", { status: 401 });
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Not found", { status: 404 });
  const doc = await db.query.documents.findFirst({ where: eq(schema.documents.id, id) });
  if (!doc || (user.role === "client" && (doc.clientId !== user.clientId || doc.status === "draft" || doc.status === "archived"))) {
    return new Response("Not found", { status: 404 });
  }
  // Uploaded documents (D-021): hand out the original file through a short-lived signed link.
  if (doc.format === "file") {
    if (!doc.fileKey) return new Response("No file uploaded yet", { status: 404 });
    return Response.redirect(new URL(signedFileUrl(doc.fileKey, doc.fileName ?? "document", 300), req.url), 302);
  }
  const client = await db.query.clients.findFirst({ where: eq(schema.clients.id, doc.clientId) });
  const pdf = await documentPdf(doc, client!, await getSettings());
  const name = doc.title.replace(/[^\w\- ]/g, "").slice(0, 80) || "document";
  return new Response(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${name} v${doc.version}.pdf"`, "Cache-Control": "private, no-store" },
  });
}
