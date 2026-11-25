import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getCurrentUser } from "@/lib/auth";

/** Shareable document link (sent via WhatsApp/Telegram). Requires sign-in, then opens the doc. */
export default async function ShareLink({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const doc = await db.query.documents.findFirst({ where: eq(schema.documents.shareToken, token) });
  if (!doc) notFound();
  const user = await getCurrentUser();
  const target = `/portal/documents/${doc.id}`;
  if (!user) redirect(`/login?next=${encodeURIComponent(target)}`);
  if (user.role === "admin") redirect(`/admin/documents/${doc.id}`);
  if (user.clientId !== doc.clientId) notFound();
  redirect(target);
}
