"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavItem } from "./shell";

export function NavLinks({ items }: { items: NavItem[] }) {
  const path = usePathname();
  const isActive = (href: string) =>
    href === "/admin" || href === "/portal" ? path === href : path === href || path.startsWith(href + "/");
  return (
    <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:overflow-visible lg:pb-4">
      {items.map((i) => (
        <Link
          key={i.href}
          href={i.href}
          className={`whitespace-nowrap rounded-md px-3 py-2 text-sm ${isActive(i.href) ? "bg-white/10 font-medium text-white" : "text-slate-300 hover:bg-white/5 hover:text-white"}`}
        >
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
