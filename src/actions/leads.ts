"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, requireUser } from "@/lib/auth";
import { fail, ok, str, type ActionState } from "@/lib/action";
import type { LeadStatus } from "@/db/schema";
import * as leads from "@/server/leads";

const STATUSES: LeadStatus[] = ["new", "contacted", "interested", "converted", "fake", "wrong_number"];

export async function addLeadAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const clientId = str(fd, "clientId");
  if (!clientId) return fail("Choose a client.");
  const answers: Record<string, string> = {};
  const q = str(fd, "question").trim() || "Business / use case";
  if (str(fd, "answer").trim()) answers[q] = str(fd, "answer").trim();
  const created = await leads.addLeads(admin, clientId, [
    { name: str(fd, "name"), phone: str(fd, "phone"), answers, replacesId: str(fd, "replacesId") || null, source: "manual" },
  ]);
  revalidatePath("/admin/leads");
  const l = created[0];
  return ok(l?.isDuplicate ? "Lead added, but flagged as a duplicate (same phone in the last 30 days)." : "Lead added.");
}

export async function importLeadsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const clientId = str(fd, "clientId");
  const file = fd.get("file");
  if (!clientId) return fail("Choose a client.");
  if (!(file instanceof File) || file.size === 0) return fail("Choose a CSV file.");
  if (file.size > 4 * 1024 * 1024) return fail("CSV is larger than 4 MB. Split it into smaller files.");
  const { leads: parsed, headers } = leads.csvToLeads(await file.text());
  if (!parsed.length) return fail(`No rows found. Headers seen: ${headers.join(", ") || "none"}`);
  const created = await leads.addLeads(admin, clientId, parsed);
  revalidatePath("/admin/leads");
  const dups = created.filter((l) => l.isDuplicate).length;
  const skipped = parsed.length - created.length;
  return ok(`Imported ${created.length} lead(s)${dups ? `, ${dups} flagged duplicate` : ""}${skipped ? `, ${skipped} already imported and skipped` : ""}.`);
}

export async function leadAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const id = str(fd, "id");
  const op = str(fd, "op");
  try {
    if (op === "status") {
      const status = str(fd, "status") as LeadStatus;
      if (!STATUSES.includes(status)) return fail("Unknown status.");
      await leads.setLeadStatus(user, id, status);
    } else if (op === "duplicate") {
      await leads.setLeadDuplicate(user, id, str(fd, "value") === "true");
    } else if (op === "erase") {
      await leads.eraseLead(user, id);
    } else return fail("Unknown action.");
  } catch (e) {
    return fail((e as Error).message);
  }
  revalidatePath(user.role === "admin" ? "/admin/leads" : "/portal/leads");
  return ok();
}
