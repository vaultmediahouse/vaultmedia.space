import "server-only";
import { headers } from "next/headers";

/** Best-effort client IP for audit logs (PRD §4: approvals logged with user, time and IP). */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return h.get("x-real-ip") ?? "unknown";
}

export async function userAgent(): Promise<string> {
  return (await headers()).get("user-agent") ?? "";
}
