"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import {
  createSession,
  destroySession,
  getCurrentUser,
  hashPassword,
  isRateLimited,
  passwordProblems,
  recordAttempt,
  verifyPassword,
  destroyAllSessionsFor,
} from "@/lib/auth";
import { clientIp, userAgent } from "@/lib/request";
import { audit } from "@/lib/audit";
import { fail, ok, str, type ActionState } from "@/lib/action";

// Constant-time-ish dummy hash so unknown usernames take as long as wrong passwords.
const DUMMY_HASH = "$2b$12$fiAYbDmJp02FB.5NyQeksOX/D3ZxdiIOrRNxC.jfQS7psouMppINa";

export async function loginAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const username = str(fd, "username").trim().toLowerCase();
  const password = str(fd, "password");
  if (!username || !password) return fail("Enter your username and password.");
  const ip = await clientIp();
  if (await isRateLimited(username, ip)) {
    return fail("Too many failed attempts. Wait 15 minutes and try again, or ask Vault Media House to reset your password.");
  }
  const user = await db.query.users.findFirst({ where: eq(schema.users.username, username) });
  const valid = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !valid || !user.active) {
    await recordAttempt(username, ip, false);
    return fail("Wrong username or password.");
  }
  if (user.clientId) {
    const client = await db.query.clients.findFirst({ where: eq(schema.clients.id, user.clientId) });
    if (!client?.active) {
      await recordAttempt(username, ip, false);
      return fail("This account is not active. Contact Vault Media House.");
    }
  }
  await recordAttempt(username, ip, true);
  await createSession(user.id, ip, await userAgent());
  await db.update(schema.users).set({ lastLogin: new Date() }).where(eq(schema.users.id, user.id));
  await audit({ userId: user.id, clientId: user.clientId, entity: "user", entityId: user.id, action: "login" });
  const next = str(fd, "next");
  if (user.mustChangePassword) redirect("/change-password");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : user.role === "admin" ? "/admin" : "/portal");
}

export async function changePasswordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const current = str(fd, "current");
  const next = str(fd, "password");
  const confirm = str(fd, "confirm");
  if (!(await verifyPassword(current, user.passwordHash))) return fail("Your current password is wrong.");
  const problem = passwordProblems(next);
  if (problem) return fail(problem);
  if (next !== confirm) return fail("The two new passwords do not match.");
  if (next === current) return fail("Choose a password different from the temporary one.");
  await db
    .update(schema.users)
    .set({ passwordHash: await hashPassword(next), mustChangePassword: false })
    .where(eq(schema.users.id, user.id));
  // Sign out every other session, then start a fresh one here.
  await destroyAllSessionsFor(user.id);
  await createSession(user.id, await clientIp(), await userAgent());
  await audit({ userId: user.id, clientId: user.clientId, entity: "user", entityId: user.id, action: "password_changed" });
  if (user.mustChangePassword) redirect(user.role === "admin" ? "/admin" : "/portal");
  return ok("Password changed.");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}
