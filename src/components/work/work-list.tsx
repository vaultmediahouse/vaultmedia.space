import Link from "next/link";
import { and, desc, eq, gte, lte, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import type { User, WorkItemStatus, WorkItemType } from "@/db/schema";
import { ActionForm, SubmitButton } from "../action-form";
import { WorkStatus } from "../status";
import { Card, Empty, Select, Table, Td, Th } from "../ui";
import { bulkWorkAction } from "@/actions/work";
import { formatINR } from "@/lib/money";
import { BOARD_COLUMNS, STATUS_LABEL, TYPE_LABEL } from "@/lib/workflow";
import { formatISTDate, weekContaining } from "@/lib/week";
import { getSettings } from "@/lib/settings";

export type WorkFilters = { client?: string; status?: string; type?: string; week?: string; view?: string };

/** Work Items table + kanban with filters (PRD §5 Work Items, §6 My Work). */
export async function WorkList({ user, base, filters, clients }: { user: User; base: string; filters: WorkFilters; clients?: { id: string; company: string }[] }) {
  const isAdmin = user.role === "admin";
  const { cutoffHour } = await getSettings();
  const conds: SQL[] = [];
  const clientId = isAdmin ? filters.client : user.clientId!;
  if (clientId) conds.push(eq(schema.workItems.clientId, clientId));
  if (filters.status && filters.status in STATUS_LABEL) conds.push(eq(schema.workItems.status, filters.status as WorkItemStatus));
  if (filters.type && filters.type in TYPE_LABEL) conds.push(eq(schema.workItems.type, filters.type as WorkItemType));
  if (filters.week && /^\d{4}-\d{2}-\d{2}$/.test(filters.week)) {
    const w = weekContaining(filters.week, cutoffHour);
    conds.push(gte(schema.workItems.createdAt, w.previousCutoff), lte(schema.workItems.createdAt, w.cutoff));
  }
  const rows = await db
    .select({ item: schema.workItems, company: schema.clients.company })
    .from(schema.workItems)
    .innerJoin(schema.clients, eq(schema.clients.id, schema.workItems.clientId))
    .where(and(...conds))
    .orderBy(desc(schema.workItems.number))
    .limit(500);
  const view = filters.view === "board" ? "board" : "table";
  const qs = (patch: Partial<WorkFilters>) => {
    const p = new URLSearchParams(Object.entries({ ...filters, ...patch }).filter(([, v]) => v) as [string, string][]);
    return `${base}?${p.toString()}`;
  };

  return (
    <>
      <form className="mb-4 flex flex-wrap items-end gap-2" action={base}>
        {isAdmin && clients && (
          <Select name="client" defaultValue={filters.client ?? ""} className="w-auto">
            <option value="">All clients</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.company}</option>)}
          </Select>
        )}
        <Select name="status" defaultValue={filters.status ?? ""} className="w-auto">
          <option value="">All statuses</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        <Select name="type" defaultValue={filters.type ?? ""} className="w-auto">
          <option value="">All types</option>
          {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        <input type="date" name="week" defaultValue={filters.week ?? ""} title="Week containing this date" className="rounded-md border border-border bg-white px-3 py-2 text-sm" />
        <input type="hidden" name="view" value={view} />
        <button className="rounded-md border border-border bg-white px-3 py-2 text-sm hover:bg-slate-50">Filter</button>
        <Link href={base} className="px-2 py-2 text-sm text-muted hover:underline">Clear</Link>
        <div className="ml-auto flex overflow-hidden rounded-md border border-border text-sm">
          <Link href={qs({ view: "table" })} className={`px-3 py-2 ${view === "table" ? "bg-ink text-white" : "bg-white"}`}>Table</Link>
          <Link href={qs({ view: "board" })} className={`px-3 py-2 ${view === "board" ? "bg-ink text-white" : "bg-white"}`}>Board</Link>
        </div>
      </form>

      {rows.length === 0 ? (
        <Empty>No work items match.</Empty>
      ) : view === "board" ? (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {BOARD_COLUMNS.map((col) => {
            const colRows = rows.filter((r) => r.item.status === col);
            return (
              <div key={col} className="w-64 shrink-0 rounded-lg bg-slate-100 p-2">
                <div className="mb-2 flex items-center justify-between px-1 text-xs font-semibold uppercase text-muted">
                  <span>{STATUS_LABEL[col]}</span><span>{colRows.length}</span>
                </div>
                <div className="space-y-2">
                  {colRows.map(({ item, company }) => (
                    <Link key={item.id} href={`${base}/${item.id}`} className="block rounded-md border border-border bg-white p-2.5 text-sm shadow-sm hover:border-slate-300">
                      <div className="font-medium">#{item.number} {item.title}</div>
                      <div className="mt-1 text-xs text-muted">{isAdmin ? `${company} · ` : ""}{TYPE_LABEL[item.type]}</div>
                      <div className="mt-1 flex justify-between text-xs"><span>{item.qty} × {formatINR(item.rate)}</span><span className="font-semibold">{formatINR(item.amount)}</span></div>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <Card>
          <ActionForm action={bulkWorkAction}>
            <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted">With selected:</span>
              <Select name="bulk" className="w-auto" defaultValue="approve">
                <option value="approve">Approve</option>
                {isAdmin ? (
                  <>
                    <option value="in_progress">Start work</option>
                    <option value="cancelled">Cancel</option>
                  </>
                ) : (
                  <option value="accepted">Accept delivery</option>
                )}
              </Select>
              <SubmitButton variant="secondary">Apply</SubmitButton>
            </div>
            <Table>
              <thead><tr><Th className="w-8"></Th><Th>#</Th><Th>Title</Th>{isAdmin && <Th>Client</Th>}<Th>Type</Th><Th>Qty × rate</Th><Th>Amount</Th><Th>Due</Th><Th>Status</Th></tr></thead>
              <tbody>
                {rows.map(({ item, company }) => (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <Td><input type="checkbox" name="ids" value={item.id} aria-label={`Select #${item.number}`} /></Td>
                    <Td className="text-muted">{item.number}</Td>
                    <Td><Link href={`${base}/${item.id}`} className="font-medium hover:underline">{item.title}</Link></Td>
                    {isAdmin && <Td>{company}</Td>}
                    <Td>{TYPE_LABEL[item.type]}</Td>
                    <Td className="tabular-nums">{item.qty} × {formatINR(item.rate)}</Td>
                    <Td className="tabular-nums font-medium">{formatINR(item.amount)}</Td>
                    <Td>{formatISTDate(item.dueDate)}</Td>
                    <Td><WorkStatus status={item.status} /></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </ActionForm>
        </Card>
      )}
    </>
  );
}
