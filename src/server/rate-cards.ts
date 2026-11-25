import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { RateCard } from "@/db/schema";
import { getSettings } from "@/lib/settings";

/** The client's rate card, created from the default rates on first use. */
export async function getRateCard(clientId: string): Promise<RateCard> {
  const rc = await db.query.rateCards.findFirst({ where: eq(schema.rateCards.clientId, clientId) });
  if (rc) return rc;
  const { defaultRates } = await getSettings();
  const [created] = await db
    .insert(schema.rateCards)
    .values({ clientId, ...defaultRates })
    .onConflictDoNothing()
    .returning();
  return created ?? (await db.query.rateCards.findFirst({ where: eq(schema.rateCards.clientId, clientId) }))!;
}
