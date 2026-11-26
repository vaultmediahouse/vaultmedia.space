import Link from "next/link";
import type { WorkItem } from "@/db/schema";
import { formatINR } from "@/lib/money";
import { isOverdue, TYPE_LABEL } from "@/lib/workflow";
import { formatISTDate, istDate } from "@/lib/week";
import { WorkStatus } from "../status";
import { Empty } from "../ui";

/** Compact list of work items for dashboards. */
export function ItemList({ rows, base, empty, showClient }: { rows: { item: WorkItem; company?: string }[]; base: string; empty: string; showClient?: boolean }) {
  if (!rows.length) return <Empty>{empty}</Empty>;
  const today = istDate(new Date());
  return (
    <ul className="divide-y divide-border">
      {rows.map(({ item, company }) => (
        <li key={item.id}>
          <Link href={`${base}/${item.id}`} className="flex items-start justify-between gap-3 py-2.5 hover:bg-slate-50">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">#{item.number} {item.title}</div>
              <div className="text-xs text-muted">
                {showClient && company ? `${company} · ` : ""}{TYPE_LABEL[item.type]} · {item.qty} × {formatINR(item.rate)}
                {item.dueDate ? ` · due ${formatISTDate(item.dueDate)}` : ""}
                {isOverdue(item, today) && <span className="ml-1 font-semibold text-red-700">· overdue</span>}
                {item.deliveredAt && ["delivered", "revision_requested", "accepted"].includes(item.status) ? ` · delivered ${formatISTDate(item.deliveredAt)}` : ""}
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <WorkStatus status={item.status} />
              <span className="text-xs font-medium tabular-nums">{formatINR(item.amount)}</span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
