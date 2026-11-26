import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { appUrl } from "@/lib/app-url";

/**
 * Notifications (PRD §8). v1 channels: in-app (notifications table) + email.
 * Email goes through Resend when RESEND_API_KEY is set; otherwise it is logged to the console.
 * WhatsApp / Telegram are copy-and-send links built in the UI (see src/lib/share.ts).
 */
export type NotifyEvent =
  | "item_proposed"
  | "approval_needed"
  | "item_sanctioned"
  | "item_rejected"
  | "delivery_uploaded"
  | "revision_requested"
  | "due_date_changed"
  | "item_accepted"
  | "new_leads"
  | "invoice_ready"
  | "payment_submitted"
  | "payment_recorded"
  | "payment_reminder"
  | "document_sent"
  | "document_viewed"
  | "document_accepted"
  | "comment";

type Audience = { admins?: boolean; clientId?: string | null; excludeUserId?: string };

export async function notify(
  audience: Audience,
  n: { event: NotifyEvent; title: string; href?: string },
) {
  const recipients: { id: string; email: string | null }[] = [];
  if (audience.admins) {
    recipients.push(
      ...(await db
        .select({ id: schema.users.id, email: schema.users.email })
        .from(schema.users)
        .where(and(eq(schema.users.role, "admin"), eq(schema.users.active, true)))),
    );
  }
  if (audience.clientId) {
    recipients.push(
      ...(await db
        .select({ id: schema.users.id, email: schema.users.email })
        .from(schema.users)
        .where(
          and(
            eq(schema.users.clientId, audience.clientId),
            eq(schema.users.active, true),
            inArray(schema.users.role, ["client"]),
          ),
        )),
    );
  }
  const targets = recipients.filter((r) => r.id !== audience.excludeUserId);
  if (targets.length === 0) return;
  await db.insert(schema.notifications).values(
    targets.map((r) => ({
      userId: r.id,
      clientId: audience.clientId ?? null,
      event: n.event,
      title: n.title,
      href: n.href ?? null,
    })),
  );
  const emails = targets.map((t) => t.email).filter((e): e is string => !!e);
  if (emails.length) await sendEmail(emails, n.title, n.href);
}

async function sendEmail(to: string[], subject: string, href?: string) {
  const base = appUrl();
  const link = href ? `${base}${href}` : base;
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.info(`[email:dev] to=${to.join(",")} subject="${subject}" link=${link}`);
    return;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM ?? "Vault Media House <onboarding@resend.dev>",
        to,
        subject,
        text: `${subject}\n\nOpen in the portal: ${link}\n\n— Vault Media House`,
      }),
    });
    if (!res.ok) console.error("[email] Resend error", res.status, await res.text());
  } catch (err) {
    // Email is best-effort; the in-app notification is the source of truth.
    console.error("[email] send failed", err);
  }
}
