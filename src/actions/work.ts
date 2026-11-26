"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { fail, int, ok, str, type ActionState } from "@/lib/action";
import { rupeesToPaise } from "@/lib/money";
import { WorkflowError } from "@/lib/workflow";
import { putFile } from "@/lib/storage";
import type { WorkItemStatus, WorkItemType } from "@/db/schema";
import * as svc from "@/server/work-items";

/**
 * Work Item actions shared by Admin and Client. The service layer enforces data isolation,
 * roles and the state machine; these wrappers only parse input and map errors to messages.
 */

const TYPES: WorkItemType[] = ["image", "video", "lead_batch", "other"];

function base(role: string) {
  return role === "admin" ? "/admin/work" : "/portal/work";
}

async function run(fn: () => Promise<unknown>, success: string, paths: string[]): Promise<ActionState> {
  try {
    await fn();
  } catch (e) {
    if (e instanceof WorkflowError || e instanceof Error) return fail(e.message);
    throw e;
  }
  // Keep both portals in step: whatever one side changes, the other side's lists and home refresh too.
  [...paths, "/admin/work", "/portal/work", "/admin", "/portal"].forEach((p) => revalidatePath(p));
  return ok(success);
}

export async function createWorkItemAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const type = str(fd, "type") as WorkItemType;
  if (!TYPES.includes(type)) return fail("Choose a type.");
  const rateRaw = str(fd, "rate");
  let item;
  try {
    item = await svc.createWorkItem(user, {
      clientId: str(fd, "clientId"),
      type,
      title: str(fd, "title"),
      brief: str(fd, "brief"),
      qty: int(fd, "qty", 1),
      rate: user.role === "admin" && rateRaw ? rupeesToPaise(rateRaw) : null,
      dueDate: str(fd, "dueDate") || null,
      submit: str(fd, "intent") !== "draft",
    });
  } catch (e) {
    return fail((e as Error).message);
  }
  const brief = fd.get("briefFile");
  if (brief instanceof File && brief.size > 0) {
    try {
      const stored = await putFile(brief);
      await svc.addAttachment(user, item.id, { kind: "brief", storageKey: stored.key, fileName: brief.name, mimeType: brief.type, sizeBytes: stored.size });
    } catch (e) {
      return fail(`Item created, but the file failed: ${(e as Error).message}`);
    }
  }
  redirect(`${base(user.role)}/${item.id}`);
}

export async function workItemAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const id = str(fd, "id");
  const op = str(fd, "op");
  const paths = [base(user.role), `${base(user.role)}/${id}`, user.role === "admin" ? "/admin" : "/portal"];
  switch (op) {
    case "submit":
      return run(() => svc.submitWorkItem(user, id), "Submitted for approval.", paths);
    case "approve":
      return run(
        () =>
          svc.approveWorkItem(
            user,
            id,
            fd.has("seenAmount") ? { qty: int(fd, "seenQty"), rate: int(fd, "seenRate"), amount: int(fd, "seenAmount") } : undefined,
          ),
        "Approved.",
        paths,
      );
    case "reject":
      return run(() => svc.rejectWorkItem(user, id, str(fd, "reason")), "Rejected.", paths);
    case "revision":
      return run(() => svc.requestRevision(user, id, str(fd, "note")), "Revision requested.", paths);
    case "comment":
      return run(() => svc.addComment(user, id, str(fd, "text")), "", paths);
    case "transition":
      return run(() => svc.transitionWorkItem(user, id, str(fd, "to") as WorkItemStatus), "Updated.", paths);
    case "edit": {
      const rateRaw = str(fd, "rate");
      return run(
        () =>
          svc.editWorkItem(user, id, {
            title: str(fd, "title"),
            brief: str(fd, "brief"),
            qty: int(fd, "qty", 1),
            rate: user.role === "admin" && rateRaw ? rupeesToPaise(rateRaw) : null,
            dueDate: str(fd, "dueDate") || null,
          }),
        "Saved.",
        paths,
      );
    }
    case "attach": {
      const kind = str(fd, "kind") === "deliverable" ? "deliverable" : "brief";
      const file = fd.get("file");
      const url = str(fd, "url").trim();
      return run(async () => {
        if (file instanceof File && file.size > 0) {
          const stored = await putFile(file);
          await svc.addAttachment(user, id, { kind, storageKey: stored.key, fileName: file.name, mimeType: file.type, sizeBytes: stored.size });
        } else if (url) {
          if (!/^https?:\/\//i.test(url)) throw new Error("Links must start with http:// or https://");
          await svc.addAttachment(user, id, { kind, url, fileName: str(fd, "label").trim() || url });
        } else {
          throw new Error("Choose a file or paste a link.");
        }
      }, "Added.", paths);
    }
    default:
      return fail("Unknown action.");
  }
}

export async function bulkWorkAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const ids = fd.getAll("ids").map(String).filter(Boolean);
  const to = str(fd, "bulk") as WorkItemStatus | "approve";
  if (!ids.length) return fail("Select at least one item.");
  const results = await svc.bulkTransition(user, ids, to);
  ["/admin/work", "/portal/work", "/admin", "/portal"].forEach((p) => revalidatePath(p));
  const failed = results.filter((r) => !r.ok);
  if (failed.length) return fail(`${results.length - failed.length} updated, ${failed.length} skipped: ${failed[0].error}`);
  return ok(`${results.length} updated.`);
}
