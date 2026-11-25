import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { and, eq, gt, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { User } from "@/db/schema";
import { randomToken, sha256 } from "./crypto";
import { getSettings } from "./settings";

/**
 * Username + password auth with server-side sessions (PRD §7A).
 * - No public signup; Admin creates every user.
 * - Passwords hashed with bcrypt (cost 12).
 * - Cookie holds a random token; only its sha256 is stored, so a DB leak cannot hijack sessions.
 * - Sessions expire after inactivity (settings.sessionIdleMinutes) and after 7 days absolute.
 * - Login rate limit: 5 failed attempts per username or IP in 15 minutes.
 */

export const SESSION_COOKIE = "vmh_session";
const ABSOLUTE_SESSION_DAYS = 7;
const MAX_FAILED = 5;
const FAIL_WINDOW_MIN = 15;

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 12);
}

export async function verifyPassword(pw: string, hash: string) {
  return bcrypt.compare(pw, hash);
}

export function passwordProblems(pw: string): string | null {
  if (pw.length < 10) return "Use at least 10 characters.";
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return "Use letters and at least one number.";
  return null;
}

export async function isRateLimited(username: string, ip: string): Promise<boolean> {
  const since = new Date(Date.now() - FAIL_WINDOW_MIN * 60_000);
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.loginAttempts)
    .where(
      and(
        eq(schema.loginAttempts.success, false),
        gt(schema.loginAttempts.createdAt, since),
        sql`(${schema.loginAttempts.username} = ${username} or ${schema.loginAttempts.ip} = ${ip})`,
      ),
    );
  return (row?.n ?? 0) >= MAX_FAILED;
}

export async function recordAttempt(username: string, ip: string, success: boolean) {
  await db.insert(schema.loginAttempts).values({ username, ip, success });
}

export async function createSession(userId: string, ip: string, ua: string) {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + ABSOLUTE_SESSION_DAYS * 86_400_000);
  await db.insert(schema.sessions).values({
    tokenHash: sha256(token),
    userId,
    ip,
    userAgent: ua.slice(0, 300),
    expiresAt,
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.delete(schema.sessions).where(eq(schema.sessions.tokenHash, sha256(token)));
  }
  jar.delete(SESSION_COOKIE);
}

export async function destroyAllSessionsFor(userId: string) {
  await db.delete(schema.sessions).where(eq(schema.sessions.userId, userId));
}

/** Current user, or null. Cached per request. Touches lastSeenAt for idle-timeout tracking. */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const tokenHash = sha256(token);
  const row = await db
    .select({ session: schema.sessions, user: schema.users })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(eq(schema.sessions.tokenHash, tokenHash))
    .limit(1);
  const hit = row[0];
  if (!hit) return null;
  const now = new Date();
  const { sessionIdleMinutes } = await getSettings();
  const idleLimit = hit.session.lastSeenAt.getTime() + sessionIdleMinutes * 60_000;
  if (hit.session.expiresAt < now || idleLimit < now.getTime() || !hit.user.active) {
    await db.delete(schema.sessions).where(eq(schema.sessions.id, hit.session.id));
    return null;
  }
  // Throttle writes: only bump lastSeenAt once a minute.
  if (now.getTime() - hit.session.lastSeenAt.getTime() > 60_000) {
    await db
      .update(schema.sessions)
      .set({ lastSeenAt: now })
      .where(eq(schema.sessions.id, hit.session.id));
  }
  if (hit.user.role === "client" && hit.user.clientId) {
    const client = await db.query.clients.findFirst({
      where: eq(schema.clients.id, hit.user.clientId),
    });
    if (!client?.active) return null;
  }
  return hit.user;
});

/** For pages: redirect to login if signed out, to password change if a temp password is in use. */
export async function requireUser(opts: { allowTempPassword?: boolean } = {}): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword && !opts.allowTempPassword) redirect("/change-password");
  return user;
}

export async function requireAdmin(): Promise<User> {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/portal");
  return user;
}

export type ClientUser = User & { clientId: string };

export async function requireClient(): Promise<ClientUser> {
  const user = await requireUser();
  if (user.role !== "client" || !user.clientId) redirect("/admin");
  return user as ClientUser;
}

/**
 * Data isolation guard (PRD §3, §15): returns the client_id the user may access.
 * Admin may access any client; a client user only their own.
 */
export function assertClientAccess(user: User, clientId: string) {
  if (user.role === "admin") return;
  if (user.clientId !== clientId) throw new Error("Not allowed.");
}
