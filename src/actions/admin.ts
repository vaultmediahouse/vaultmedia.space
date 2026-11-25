"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireAdmin, hashPassword, destroyAllSessionsFor, passwordProblems } from "@/lib/auth";
import { tempPassword } from "@/lib/crypto";
import { audit } from "@/lib/audit";
import { fail, int, ok, str, type ActionState } from "@/lib/action";
import { rupeesToPaise } from "@/lib/money";
import { saveSettings, getSettings, type AppSettings } from "@/lib/settings";
import { getRateCard } from "@/server/rate-cards";
import { appUrl } from "@/lib/app-url";

const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,31}$/;

function credentialsMessage(name: string, username: string, password: string) {
  const url = appUrl();
  return [
    `Hi ${name}, here is your login for the Vault Media House client portal:`,
    ``,
    `Link: ${url}/login`,
    `Username: ${username}`,
    `Temporary password: ${password}`,
    ``,
    `You will be asked to set your own password the first time you sign in. Please don't share this message.`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

export async function createClientAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const company = str(fd, "company").trim();
  if (!company) return fail("Company name is required.");
  const settings = await getSettings();
  const [client] = await db
    .insert(schema.clients)
    .values({
      company,
      contactName: str(fd, "contactName").trim() || null,
      phone: str(fd, "phone").trim() || null,
      email: str(fd, "email").trim() || null,
      gstNo: str(fd, "gstNo").trim() || null,
      address: str(fd, "address").trim() || null,
      city: str(fd, "city").trim() || null,
      notes: str(fd, "notes").trim() || null,
    })
    .returning();
  await db.insert(schema.rateCards).values({ clientId: client.id, ...settings.defaultRates });
  await audit({ userId: admin.id, clientId: client.id, entity: "client", entityId: client.id, action: "create", after: { company } });
  redirect(`/admin/clients/${client.id}`);
}

export async function updateClientAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const id = str(fd, "clientId");
  const before = await db.query.clients.findFirst({ where: eq(schema.clients.id, id) });
  if (!before) return fail("Client not found.");
  const patch = {
    company: str(fd, "company").trim() || before.company,
    contactName: str(fd, "contactName").trim() || null,
    phone: str(fd, "phone").trim() || null,
    email: str(fd, "email").trim() || null,
    gstNo: str(fd, "gstNo").trim() || null,
    address: str(fd, "address").trim() || null,
    city: str(fd, "city").trim() || null,
    notes: str(fd, "notes").trim() || null,
    requireDocsBeforeWork: fd.get("requireDocsBeforeWork") === "on",
  };
  await db.update(schema.clients).set(patch).where(eq(schema.clients.id, id));
  await audit({ userId: admin.id, clientId: id, entity: "client", entityId: id, action: "update", before, after: patch });
  revalidatePath(`/admin/clients/${id}`);
  return ok("Saved.");
}

export async function setClientActiveAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const id = str(fd, "clientId");
  const active = str(fd, "active") === "true";
  await db.update(schema.clients).set({ active }).where(eq(schema.clients.id, id));
  if (!active) {
    const users = await db.select().from(schema.users).where(eq(schema.users.clientId, id));
    for (const u of users) await destroyAllSessionsFor(u.id);
  }
  await audit({ userId: admin.id, clientId: id, entity: "client", entityId: id, action: active ? "activate" : "deactivate" });
  revalidatePath(`/admin/clients/${id}`);
  return ok(active ? "Client activated." : "Client deactivated; their users are signed out.");
}

export async function updateRateCardAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const clientId = str(fd, "clientId");
  const before = await getRateCard(clientId);
  const money = (k: string) => rupeesToPaise(str(fd, k));
  const patch = {
    imageRate: money("imageRate"),
    videoRate: money("videoRate"),
    leadRate: money("leadRate"),
    revisionRate: money("revisionRate"),
    setupFee: money("setupFee"),
    autoSanctionLimit: money("autoSanctionLimit") ?? 0,
    freeRevisions: int(fd, "freeRevisions", before.freeRevisions),
    maxVideoSeconds: int(fd, "maxVideoSeconds", before.maxVideoSeconds),
  };
  if (Object.values(patch).some((v) => v === null || (v as number) < 0)) return fail("Enter valid non-negative amounts.");
  await db
    .update(schema.rateCards)
    .set({ ...(patch as Record<string, number>), updatedAt: new Date() })
    .where(eq(schema.rateCards.clientId, clientId));
  await audit({ userId: admin.id, clientId, entity: "rate_card", entityId: before.id, action: "update", before, after: patch });
  revalidatePath(`/admin/clients/${clientId}`);
  return ok("Rate card saved. New Work Items use these rates; existing items keep their agreed rate.");
}

// ---------------------------------------------------------------------------
// Users & credentials (PRD §7A)
// ---------------------------------------------------------------------------

export async function createClientUserAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const clientId = str(fd, "clientId");
  const name = str(fd, "name").trim();
  const username = str(fd, "username").trim().toLowerCase();
  const email = str(fd, "email").trim() || null;
  // Optional: the admin may choose the first password; otherwise a strong one is generated (D-016).
  const chosen = str(fd, "password").trim();
  if (!name) return fail("Enter the person's name.");
  if (!USERNAME_RE.test(username)) return fail("Username: 3–32 characters, lowercase letters, numbers, dot, dash or underscore.");
  const count = await db.$count(schema.users, and(eq(schema.users.clientId, clientId), eq(schema.users.active, true)));
  if (count >= 3) return fail("A client can have at most 3 active logins (PRD §3). Deactivate one first.");
  const taken = await db.query.users.findFirst({ where: eq(schema.users.username, username) });
  if (taken) return fail("That username is taken.");
  if (chosen) {
    const problem = passwordProblems(chosen);
    if (problem) return fail(`Password: ${problem}`);
  }
  const password = chosen || tempPassword();
  const [user] = await db
    .insert(schema.users)
    .values({ role: "client", name, username, email, clientId, passwordHash: await hashPassword(password), mustChangePassword: true })
    .returning();
  await audit({ userId: admin.id, clientId, entity: "user", entityId: user.id, action: "create", after: { username, name } });
  revalidatePath(`/admin/clients/${clientId}`);
  return ok("Login created. Send this message now — the password is not shown again.", {
    copy: credentialsMessage(name, username, password),
    link: `${appUrl()}/login`,
  });
}

export async function resetCredentialsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const userId = str(fd, "userId");
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
  if (!user) return fail("User not found.");
  const password = tempPassword();
  await db
    .update(schema.users)
    .set({ passwordHash: await hashPassword(password), mustChangePassword: true, active: true })
    .where(eq(schema.users.id, userId));
  await destroyAllSessionsFor(userId);
  await audit({ userId: admin.id, clientId: user.clientId, entity: "user", entityId: userId, action: "reset_credentials" });
  if (user.clientId) revalidatePath(`/admin/clients/${user.clientId}`);
  return ok(`New temporary password for ${user.username}. Old sessions are signed out.`, {
    copy: credentialsMessage(user.name, user.username, password),
    link: `${appUrl()}/login`,
  });
}

export async function setUserActiveAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const userId = str(fd, "userId");
  const active = str(fd, "active") === "true";
  if (userId === admin.id) return fail("You cannot deactivate yourself.");
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
  if (!user) return fail("User not found.");
  if (active && user.clientId) {
    const count = await db.$count(schema.users, and(eq(schema.users.clientId, user.clientId), eq(schema.users.active, true), ne(schema.users.id, userId)));
    if (count >= 3) return fail("A client can have at most 3 active logins.");
  }
  await db.update(schema.users).set({ active }).where(eq(schema.users.id, userId));
  if (!active) await destroyAllSessionsFor(userId);
  await audit({ userId: admin.id, clientId: user.clientId, entity: "user", entityId: userId, action: active ? "activate" : "deactivate" });
  if (user.clientId) revalidatePath(`/admin/clients/${user.clientId}`);
  return ok(active ? "Access restored." : "Access removed and signed out.");
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export async function saveSettingsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const before = await getSettings();
  const money = (k: string, fb: number) => rupeesToPaise(str(fd, k)) ?? fb;
  const gstPct = Number(str(fd, "gstRate"));
  const patch: Partial<AppSettings> = {
    businessName: str(fd, "businessName").trim() || "Vault Media House",
    businessAddress: str(fd, "businessAddress").trim(),
    businessEmail: str(fd, "businessEmail").trim(),
    businessPhone: str(fd, "businessPhone").trim(),
    gstEnabled: fd.get("gstEnabled") === "on",
    gstin: str(fd, "gstin").trim().toUpperCase(),
    gstRateBps: Number.isFinite(gstPct) ? Math.round(gstPct * 100) : before.gstRateBps,
    upiId: str(fd, "upiId").trim(),
    bankDetails: str(fd, "bankDetails").trim(),
    invoicePrefix: str(fd, "invoicePrefix").trim().toUpperCase() || "VMH",
    // Can only move forward: going back would reuse invoice numbers.
    nextInvoiceNumber: Math.max(before.nextInvoiceNumber, int(fd, "nextInvoiceNumber", before.nextInvoiceNumber)),
    cutoffHour: Math.min(23, Math.max(0, int(fd, "cutoffHour", before.cutoffHour))),
    paymentWindowDays: Math.max(0, int(fd, "paymentWindowDays", before.paymentWindowDays)),
    autoAcceptHours: Math.max(0, int(fd, "autoAcceptHours", before.autoAcceptHours)),
    sessionIdleMinutes: Math.max(10, int(fd, "sessionIdleMinutes", before.sessionIdleMinutes)),
    jurisdiction: str(fd, "jurisdiction").trim() || before.jurisdiction,
    defaultRates: {
      imageRate: money("imageRate", before.defaultRates.imageRate),
      videoRate: money("videoRate", before.defaultRates.videoRate),
      leadRate: money("leadRate", before.defaultRates.leadRate),
      revisionRate: money("revisionRate", before.defaultRates.revisionRate),
      setupFee: money("setupFee", before.defaultRates.setupFee),
      freeRevisions: int(fd, "freeRevisions", before.defaultRates.freeRevisions),
      maxVideoSeconds: int(fd, "maxVideoSeconds", before.defaultRates.maxVideoSeconds),
    },
  };
  if (patch.gstEnabled && !patch.gstin) return fail("Enter your GSTIN to show GST on invoices.");
  await saveSettings(patch);
  await audit({ userId: admin.id, entity: "settings", entityId: "app", action: "update", before, after: patch });
  revalidatePath("/admin/settings");
  return ok("Settings saved.");
}
