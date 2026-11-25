import "server-only";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

/**
 * Agency-wide settings (PRD §5 Settings). Stored as one JSON row under key "app".
 * Per-client rates live in rate_cards, not here.
 */
export type AppSettings = {
  businessName: string;
  businessAddress: string;
  businessEmail: string;
  businessPhone: string;
  gstEnabled: boolean;
  gstin: string;
  gstRateBps: number; // 1800 = 18%
  upiId: string;
  bankDetails: string;
  invoicePrefix: string;
  nextInvoiceNumber: number;
  cutoffHour: number; // Sunday cut-off hour in IST (0–23)
  paymentWindowDays: number;
  autoAcceptHours: number; // 0 disables auto-accept
  sessionIdleMinutes: number;
  jurisdiction: string;
  defaultRates: {
    imageRate: number;
    videoRate: number;
    leadRate: number;
    revisionRate: number;
    setupFee: number;
    freeRevisions: number;
    maxVideoSeconds: number;
  };
};

export const DEFAULT_SETTINGS: AppSettings = {
  businessName: "Vault Media House",
  businessAddress: "",
  businessEmail: "",
  businessPhone: "",
  gstEnabled: false,
  gstin: "",
  gstRateBps: 1800,
  upiId: "",
  bankDetails: "",
  invoicePrefix: "VMH",
  nextInvoiceNumber: 1,
  cutoffHour: 20,
  paymentWindowDays: 3,
  autoAcceptHours: 48,
  sessionIdleMinutes: 120,
  jurisdiction: "Ahmedabad, Gujarat, India",
  defaultRates: {
    imageRate: 30000,
    videoRate: 30000,
    leadRate: 20000,
    revisionRate: 10000,
    setupFee: 300000,
    freeRevisions: 2,
    maxVideoSeconds: 30,
  },
};

export async function getSettings(): Promise<AppSettings> {
  const row = await db.query.settings.findFirst({ where: eq(schema.settings.key, "app") });
  const stored = (row?.value ?? {}) as Partial<AppSettings>;
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    defaultRates: { ...DEFAULT_SETTINGS.defaultRates, ...(stored.defaultRates ?? {}) },
  };
}

export async function saveSettings(patch: Partial<AppSettings>) {
  const current = await getSettings();
  const value = { ...current, ...patch };
  await db
    .insert(schema.settings)
    .values({ key: "app", value })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value, updatedAt: new Date() } });
  return value;
}
