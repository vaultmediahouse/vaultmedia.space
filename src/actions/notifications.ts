"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { ok, type ActionState } from "@/lib/action";

export async function markAllReadAction(// eslint-disable-next-line @typescript-eslint/no-unused-vars
  _prev: ActionState,
): Promise<ActionState> {
  const user = await requireUser();
  await db.update(schema.notifications).set({ readAt: new Date() }).where(and(eq(schema.notifications.userId, user.id), isNull(schema.notifications.readAt)));
  revalidatePath("/notifications");
  return ok();
}
