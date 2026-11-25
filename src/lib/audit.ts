import "server-only";
import { db, schema } from "@/db";
import type { Tx } from "@/db";
import { clientIp } from "./request";

/**
 * Append-only audit log (PRD §4, §12): approvals, edits, document acceptance, billing changes.
 * Every entry records user, client, entity, action, before/after snapshots and IP.
 */
export async function audit(
  entry: {
    userId: string | null;
    clientId?: string | null;
    entity: string;
    entityId?: string | null;
    action: string;
    before?: unknown;
    after?: unknown;
  },
  tx?: Tx,
) {
  let ip = "system";
  try {
    ip = await clientIp();
  } catch {
    // Outside a request (cron, scripts): keep "system".
  }
  await (tx ?? db).insert(schema.activityLog).values({
    userId: entry.userId,
    clientId: entry.clientId ?? null,
    entity: entry.entity,
    entityId: entry.entityId ?? null,
    action: entry.action,
    before: entry.before ?? null,
    after: entry.after ?? null,
    ip,
  });
}
