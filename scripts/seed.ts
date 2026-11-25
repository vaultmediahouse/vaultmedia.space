/**
 * Seed script: `npm run db:seed` (add `-- --demo` for a demo client with sample data).
 *
 * - Creates the first Admin user (SEED_ADMIN_USERNAME, default "chief"). If SEED_ADMIN_PASSWORD is
 *   empty a strong temporary password is generated and printed ONCE; it must be changed at first login.
 * - Inserts default document templates (skips types that already have a template).
 * - Writes default agency settings (Vault Media House) if none exist.
 * Safe to re-run: it never overwrites existing users, templates or settings.
 */
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, schema } from "../src/db";
import { DEFAULT_TEMPLATES, unfilledVariables } from "../src/lib/templates";

function tempPassword() {
  const a = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const b = randomBytes(12);
  let s = "";
  for (let i = 0; i < 12; i++) s += a[b[i] % a.length];
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}`;
}

async function main() {
  const demo = process.argv.includes("--demo");
  const username = (process.env.SEED_ADMIN_USERNAME || "chief").toLowerCase();
  const existing = await db.query.users.findFirst({ where: eq(schema.users.username, username) });
  let adminId = existing?.id;
  if (!existing) {
    const password = process.env.SEED_ADMIN_PASSWORD || tempPassword();
    const [admin] = await db
      .insert(schema.users)
      .values({
        role: "admin",
        name: "Chief",
        username,
        passwordHash: await bcrypt.hash(password, 12),
        mustChangePassword: true,
      })
      .returning();
    adminId = admin.id;
    console.log(`\nAdmin created  username: ${username}  temporary password: ${password}`);
    console.log("You will be asked to change it at first login.\n");
  } else {
    console.log(`Admin "${username}" already exists — left unchanged.`);
  }

  const templates = await db.select().from(schema.docTemplates);
  for (const t of DEFAULT_TEMPLATES) {
    if (templates.some((x) => x.type === t.type)) continue;
    await db.insert(schema.docTemplates).values({ ...t, variables: unfilledVariables(t.body) });
    console.log(`Template added: ${t.name}`);
  }

  const settings = await db.query.settings.findFirst({ where: eq(schema.settings.key, "app") });
  if (!settings) {
    await db.insert(schema.settings).values({ key: "app", value: { businessName: "Vault Media House", nextInvoiceNumber: 1 } });
    console.log("Default settings written (Vault Media House). Fill in GST, UPI and bank details in Admin → Settings.");
  }

  if (demo) await seedDemo(adminId!);
  process.exit(0);
}

async function seedDemo(adminId: string) {
  const found = await db.query.clients.findFirst({ where: eq(schema.clients.company, "Demo Currency Machines (Ahmedabad)") });
  if (found) {
    console.log("Demo client already exists.");
    return;
  }
  const [client] = await db
    .insert(schema.clients)
    .values({ company: "Demo Currency Machines (Ahmedabad)", contactName: "Demo Owner", phone: "+91 98250 00000", city: "Ahmedabad" })
    .returning();
  await db.insert(schema.rateCards).values({ clientId: client.id });
  const password = tempPassword();
  await db.insert(schema.users).values({
    role: "client",
    name: "Demo Owner",
    username: "demo.client",
    passwordHash: await bcrypt.hash(password, 12),
    clientId: client.id,
    mustChangePassword: true,
  });
  console.log(`Demo client login  username: demo.client  temporary password: ${password}`);
  const now = Date.now();
  const H = 3_600_000;
  await db.insert(schema.workItems).values([
    { clientId: client.id, type: "image", title: "Diwali offer static post", qty: 2, rate: 30000, amount: 60000, status: "proposed", createdBy: adminId, adminApprovedAt: new Date(now - 5 * H), adminApprovedBy: adminId, brief: "Two square posts for Instagram & Facebook, Gujarati + English." },
    { clientId: client.id, type: "video", title: "15-sec machine demo reel", qty: 1, rate: 30000, amount: 30000, status: "draft", createdBy: adminId },
  ]);
  const names = ["Ramesh Patel", "Hetal Shah", "Vikram Desai", "Anjali Mehta", "Kiran Joshi"];
  await db.insert(schema.leads).values(
    names.map((name, i) => ({
      clientId: client.id,
      name,
      phone: `+91 9825${String(100000 + i * 7919).slice(0, 6)}`,
      phoneNormalized: `9825${String(100000 + i * 7919).slice(0, 6)}`,
      answers: { "business type": ["Bank branch", "Jewellery shop", "Petrol pump", "Wholesale trader", "Co-op society"][i] },
      source: "demo",
      receivedAt: new Date(now - (i * 14 + 2) * H),
    })),
  );
  console.log("Demo work items and leads added.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
