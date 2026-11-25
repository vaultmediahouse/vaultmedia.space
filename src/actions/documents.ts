"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireAdmin, requireClient } from "@/lib/auth";
import { fail, ok, str, type ActionState } from "@/lib/action";
import { clientIp } from "@/lib/request";
import { putFile } from "@/lib/storage";
import { unfilledVariables } from "@/lib/templates";
import { audit } from "@/lib/audit";
import { formatINR, rupeesToPaise } from "@/lib/money";
import type { DocType } from "@/db/schema";
import * as docs from "@/server/documents";

const TYPES: DocType[] = ["contract", "sow", "nda", "dpa", "deposit", "other"];

export async function createDocumentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const clientId = str(fd, "clientId");
  const templateId = str(fd, "templateId");
  if (!clientId) return fail("Choose a client.");
  let id: string;
  try {
    if (templateId) {
      const deposit = rupeesToPaise(str(fd, "depositAmount"));
      const doc = await docs.createFromTemplate(admin, clientId, templateId, deposit !== null ? { deposit_amount: formatINR(deposit) } : {});
      id = doc.id;
    } else {
      const type = (str(fd, "type") || "other") as DocType;
      if (!TYPES.includes(type)) return fail("Choose a type.");
      const doc = await docs.createBlank(admin, clientId, type, str(fd, "title").trim() || "Untitled document", "# Title\n\nWrite here…");
      id = doc.id;
    }
  } catch (e) {
    return fail((e as Error).message);
  }
  redirect(`/admin/documents/${id}`);
}

export async function documentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const id = str(fd, "id");
  const op = str(fd, "op");
  try {
    if (op === "save") {
      const doc = await docs.saveDocument(admin, id, str(fd, "title").trim() || "Untitled", str(fd, "content"));
      if (doc.id !== id) redirect(`/admin/documents/${doc.id}`);
      revalidatePath(`/admin/documents/${id}`);
      return ok("Saved as draft. Send it to the client when ready.");
    }
    if (op === "send") {
      await docs.sendDocument(admin, id, str(fd, "expiresAt") || null);
      revalidatePath(`/admin/documents/${id}`);
      return ok("Sent. The client sees it in the portal; copy the link below to share on WhatsApp/Telegram.");
    }
    if (op === "archive") {
      await docs.archiveDocument(admin, id);
      revalidatePath(`/admin/documents/${id}`);
      return ok("Archived.");
    }
  } catch (e) {
    if ((e as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw e;
    return fail((e as Error).message);
  }
  return fail("Unknown action.");
}

export async function acceptDocumentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireClient();
  const id = str(fd, "id");
  let signedKey: string | null = null;
  const file = fd.get("signedPdf");
  try {
    if (file instanceof File && file.size > 0) {
      if (file.type !== "application/pdf") return fail("The signed copy must be a PDF.");
      signedKey = (await putFile(file)).key;
    }
    await docs.acceptDocument(user, id, {
      typedName: str(fd, "typedName"),
      agreed: fd.get("agree") === "on",
      ip: await clientIp(),
      signedStorageKey: signedKey,
    });
  } catch (e) {
    return fail((e as Error).message);
  }
  revalidatePath(`/portal/documents/${id}`);
  revalidatePath("/portal/documents");
  return ok("Accepted. A copy stays in your Documents.");
}

export async function saveTemplateAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const id = str(fd, "id");
  const body = str(fd, "body");
  const name = str(fd, "name").trim();
  if (!name || !body.trim()) return fail("Name and body are required.");
  await db
    .update(schema.docTemplates)
    .set({ name, body, variables: unfilledVariables(body), updatedAt: new Date() })
    .where(eq(schema.docTemplates.id, id));
  await audit({ userId: admin.id, entity: "doc_template", entityId: id, action: "update" });
  revalidatePath(`/admin/documents/templates/${id}`);
  return ok("Template saved. Documents already created are not changed.");
}
