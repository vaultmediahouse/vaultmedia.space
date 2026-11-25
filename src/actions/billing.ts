"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, requireUser } from "@/lib/auth";
import { fail, ok, str, type ActionState } from "@/lib/action";
import { getSettings } from "@/lib/settings";
import { lastClosedWeek, weekContaining } from "@/lib/week";
import { formatINR, rupeesToPaise } from "@/lib/money";
import * as billing from "@/server/billing";
import { runAutoAccept } from "@/server/work-items";

export async function generateInvoicesAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const { cutoffHour } = await getSettings();
  const weekStart = str(fd, "weekStart");
  const clientId = str(fd, "clientId");
  const week = weekStart ? weekContaining(weekStart, cutoffHour) : lastClosedWeek(new Date(), cutoffHour);
  if (week.cutoff > new Date()) return fail("That week's cut-off has not passed yet.");
  await runAutoAccept();
  try {
    if (clientId) {
      const inv = await billing.generateInvoice(admin, clientId, week);
      revalidatePath("/admin/billing");
      return inv ? ok(`Invoice ${inv.number} created: ${formatINR(inv.total)}.`) : ok("Nothing to bill for that week (or the invoice already exists).");
    }
    const { created } = await billing.runWeeklyInvoices(admin);
    revalidatePath("/admin/billing");
    return ok(created.length ? `${created.length} invoice(s) created for ${week.weekStart} – ${week.weekEnd}.` : `Nothing new to bill for ${week.weekStart} – ${week.weekEnd}.`);
  } catch (e) {
    return fail((e as Error).message);
  }
}

export async function invoiceAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const id = str(fd, "id");
  const op = str(fd, "op");
  try {
    if (op === "submit_ref") await billing.submitPaymentRef(user, id, str(fd, "ref"));
    else if (op === "mark_paid") await billing.markInvoicePaid(user, id, str(fd, "ref") || null);
    else if (op === "void") await billing.voidInvoice(user, id);
    else if (op === "add_adjustment") {
      const rupees = rupeesToPaise(str(fd, "amount").replace(/^-/, ""));
      if (rupees === null) return fail("Enter the amount in rupees, e.g. 3000.");
      const sign = str(fd, "sign") === "discount" ? -1 : 1;
      await billing.addInvoiceAdjustment(user, id, { description: str(fd, "description"), amount: sign * rupees });
    } else if (op === "remove_adjustment") await billing.removeInvoiceAdjustment(user, id, str(fd, "lineId"));
    else return fail("Unknown action.");
  } catch (e) {
    return fail((e as Error).message);
  }
  revalidatePath(user.role === "admin" ? `/admin/billing/${id}` : `/portal/billing/${id}`);
  revalidatePath(user.role === "admin" ? "/admin/billing" : "/portal/billing");
  const done: Record<string, string> = {
    submit_ref: "Thanks — we'll confirm once received.",
    void: "Invoice voided; its items are back in the unbilled pool.",
    mark_paid: "Marked paid.",
    add_adjustment: "Line added; totals updated.",
    remove_adjustment: "Line removed; totals updated.",
  };
  return ok(done[op] ?? "Done.");
}
