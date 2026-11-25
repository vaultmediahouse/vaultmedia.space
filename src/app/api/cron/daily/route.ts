import { runAutoAccept } from "@/server/work-items";
import { runPaymentReminders, runWeeklyInvoices } from "@/server/billing";

/**
 * Daily job (schedule it for ~09:00 IST = 03:30 UTC). Safe to run more than once:
 *  - auto-accepts deliveries past the review window (every run);
 *  - generates invoices for the last closed week (idempotent per client+week, so it effectively
 *    runs on Monday; later runs that week do nothing);
 *  - sends payment reminders on Thursdays (IST) for invoices past their due date.
 * Auth: Authorization: Bearer <CRON_SECRET>.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const now = new Date();
  const autoAccepted = await runAutoAccept(now);
  const { week, created } = await runWeeklyInvoices(null, now);
  const istWeekday = new Date(now.getTime() + 330 * 60_000).getUTCDay(); // 4 = Thursday
  const reminders = istWeekday === 4 ? await runPaymentReminders(now) : 0;
  return Response.json({ ok: true, autoAccepted, week: week.weekStart, invoicesCreated: created.map((i) => i.number), reminders });
}
