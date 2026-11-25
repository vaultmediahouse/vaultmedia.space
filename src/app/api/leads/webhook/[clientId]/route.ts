import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { verify } from "@/lib/crypto";
import { addLeads, type LeadInput } from "@/server/leads";

/**
 * Lead webhook (PRD §5 Leads, Phase 2): POST JSON from a form tool (Zapier, Make, Pabbly, a
 * custom Meta Lead Ads integration). Auth: ?token=<signed token shown on the client page>.
 * Body: one lead or an array: { name, phone, answers: { question: answer }, received_at? }.
 */
export async function POST(req: Request, ctx: RouteContext<"/api/leads/webhook/[clientId]">) {
  const { clientId } = await ctx.params;
  const token = new URL(req.url).searchParams.get("token") ?? req.headers.get("x-webhook-token") ?? "";
  if (!token || !verify(`lead-webhook:${clientId}`, token)) return new Response("Unauthorized", { status: 401 });
  const client = await db.query.clients.findFirst({ where: eq(schema.clients.id, clientId) });
  if (!client?.active) return new Response("Unknown client", { status: 404 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response("Body must be JSON", { status: 400 });
  }
  const list = (Array.isArray(body) ? body : [body]).slice(0, 500) as Record<string, unknown>[];
  const inputs: LeadInput[] = list.map((b) => {
    const answers: Record<string, string> = {};
    if (b.answers && typeof b.answers === "object") {
      for (const [k, v] of Object.entries(b.answers as Record<string, unknown>)) answers[k] = String(v ?? "");
    }
    const t = b.received_at ? new Date(String(b.received_at)) : undefined;
    return {
      name: b.name ? String(b.name) : null,
      phone: b.phone ? String(b.phone) : null,
      answers,
      receivedAt: t && !Number.isNaN(t.getTime()) ? t : undefined,
      source: "webhook",
    };
  });
  const created = await addLeads(null, clientId, inputs);
  return Response.json({ ok: true, created: created.length });
}
