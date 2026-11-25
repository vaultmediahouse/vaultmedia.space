import Link from "next/link";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { User } from "@/db/schema";
import { logoutAction } from "@/actions/auth";
import { NavLinks } from "./nav-links";

export type NavItem = { href: string; label: string };

export const ADMIN_NAV: NavItem[] = [
  { href: "/admin", label: "Home" },
  { href: "/admin/clients", label: "Clients" },
  { href: "/admin/work", label: "Work Items" },
  { href: "/admin/leads", label: "Leads" },
  { href: "/admin/billing", label: "Billing" },
  { href: "/admin/documents", label: "Documents" },
  { href: "/admin/reports", label: "Reports" },
  { href: "/admin/activity", label: "Audit log" },
  { href: "/admin/settings", label: "Settings" },
];

export const CLIENT_NAV: NavItem[] = [
  { href: "/portal", label: "Home" },
  { href: "/portal/work", label: "My Work" },
  { href: "/portal/leads", label: "My Leads" },
  { href: "/portal/billing", label: "Billing" },
  { href: "/portal/documents", label: "Documents" },
];

export async function Shell({ user, nav, subtitle, children }: { user: User; nav: NavItem[]; subtitle?: string; children: React.ReactNode }) {
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.notifications)
    .where(and(eq(schema.notifications.userId, user.id), isNull(schema.notifications.readAt)));
  const home = user.role === "admin" ? "/admin" : "/portal";
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="no-print bg-ink text-slate-200 lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto">
        <div className="flex items-center justify-between px-4 py-4 lg:block">
          <Link href={home} className="block">
            <div className="text-[15px] font-semibold tracking-tight text-white">Vault Media House</div>
            <div className="text-xs text-gold">{subtitle ?? (user.role === "admin" ? "Admin" : "Client Portal")}</div>
          </Link>
          <Link href="/notifications" className="relative rounded-md px-2 py-1 text-sm lg:hidden" aria-label="Notifications">
            🔔{n > 0 && <span className="ml-1 rounded-full bg-gold px-1.5 text-xs text-white">{n}</span>}
          </Link>
        </div>
        <NavLinks items={nav} />
        <div className="border-t border-white/10 px-4 py-3 text-sm lg:py-4">
          <Link href="/notifications" className="mb-3 flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-white/5">
            <span>Notifications</span>
            {n > 0 && <span className="rounded-full bg-gold px-2 text-xs font-semibold text-white">{n}</span>}
          </Link>
          <div className="px-2 text-xs text-slate-400">Signed in as</div>
          <div className="px-2 font-medium text-white">{user.name}</div>
          <div className="mt-2 flex gap-3 px-2 text-xs">
            <Link href="/change-password" className="text-slate-400 hover:text-white">Change password</Link>
            <form action={logoutAction}>
              <button className="text-slate-400 hover:text-white">Sign out</button>
            </form>
          </div>
        </div>
      </aside>
      <main className="min-w-0 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
