import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { ActionButton } from "@/components/action-form";
import { Shell, ADMIN_NAV, CLIENT_NAV } from "@/components/shell";
import { Card, Empty, PageHeader } from "@/components/ui";
import { markAllReadAction } from "@/actions/notifications";
import { requireUser } from "@/lib/auth";
import { formatISTDateTime } from "@/lib/week";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const user = await requireUser();
  const rows = await db.select().from(schema.notifications).where(eq(schema.notifications.userId, user.id)).orderBy(desc(schema.notifications.createdAt)).limit(100);
  const unread = rows.filter((r) => !r.readAt).length;
  // Opening this page marks everything as read (after rendering the unread highlight once).
  if (unread) {
    await db.update(schema.notifications).set({ readAt: new Date() }).where(and(eq(schema.notifications.userId, user.id), isNull(schema.notifications.readAt)));
  }
  return (
    <Shell user={user} nav={user.role === "admin" ? ADMIN_NAV : CLIENT_NAV}>
      <PageHeader title="Notifications" actions={unread ? <ActionButton action={markAllReadAction} hidden={{}} variant="secondary">Mark all read</ActionButton> : null} />
      <Card>
        {rows.length === 0 ? <Empty>No notifications yet.</Empty> : (
          <ul className="divide-y divide-border">
            {rows.map((n) => (
              <li key={n.id} className={`py-2.5 ${n.readAt ? "" : "font-medium"}`}>
                {n.href ? <Link className="hover:underline" href={n.href}>{n.title}</Link> : n.title}
                <div className="text-xs font-normal text-muted">{formatISTDateTime(n.createdAt)}</div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </Shell>
  );
}
