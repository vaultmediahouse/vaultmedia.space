/**
 * Vault Media House — Client Work & Billing Portal
 * Database schema (PostgreSQL, Drizzle ORM).
 *
 * Conventions
 * - Every business table carries client_id from day one (PRD §13), even though v1 serves one client.
 * - Money is stored as integer PAISE (₹1 = 100 paise) to avoid floating-point errors.
 * - Timestamps are timestamptz; the business timezone is Asia/Kolkata (see src/lib/week.ts).
 * See docs/DATABASE.md for the table-by-table reference.
 */
import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  uuid,
  pgEnum,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const ts = (name: string) => timestamp(name, { withTimezone: true });

export const roleEnum = pgEnum("role", ["admin", "client"]);

export const workItemTypeEnum = pgEnum("work_item_type", [
  "image",
  "video",
  "lead_batch",
  "revision",
  "other",
]);

export const workItemStatusEnum = pgEnum("work_item_status", [
  "draft",
  "proposed",
  "sanctioned",
  "in_progress",
  "delivered",
  "revision_requested",
  "accepted",
  "billed",
  "paid",
  "rejected",
  "cancelled",
]);

export const leadStatusEnum = pgEnum("lead_status", [
  "new",
  "contacted",
  "interested",
  "converted",
  "fake",
  "wrong_number",
]);

export const invoiceStatusEnum = pgEnum("invoice_status", [
  "draft",
  "sent",
  "payment_submitted",
  "paid",
  "void",
]);

export const docTypeEnum = pgEnum("doc_type", [
  "contract",
  "sow",
  "nda",
  "dpa",
  "deposit",
  "other",
]);

export const docStatusEnum = pgEnum("doc_status", [
  "draft",
  "sent",
  "viewed",
  "accepted",
  "expired",
  "archived",
]);

// ---------------------------------------------------------------------------
// Clients, users, auth
// ---------------------------------------------------------------------------

export const clients = pgTable("clients", {
  id: id(),
  company: text("company").notNull(),
  contactName: text("contact_name"),
  phone: text("phone"),
  email: text("email"),
  gstNo: text("gst_no"),
  address: text("address"),
  city: text("city"),
  notes: text("notes"),
  active: boolean("active").notNull().default(true),
  /** If true, new Work Items are blocked until Contract + SOW are accepted (PRD §7). */
  requireDocsBeforeWork: boolean("require_docs_before_work").notNull().default(false),
  createdAt: createdAt(),
});

export const users = pgTable(
  "users",
  {
    id: id(),
    role: roleEnum("role").notNull(),
    name: text("name").notNull(),
    username: text("username").notNull(),
    email: text("email"),
    passwordHash: text("password_hash").notNull(),
    mustChangePassword: boolean("must_change_password").notNull().default(true),
    clientId: uuid("client_id").references(() => clients.id),
    active: boolean("active").notNull().default(true),
    lastLogin: ts("last_login"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("users_username_uq").on(t.username)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    /** sha256 of the cookie token; the raw token is never stored. */
    tokenHash: text("token_hash").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    ip: text("ip"),
    userAgent: text("user_agent"),
    lastSeenAt: ts("last_seen_at").notNull().defaultNow(),
    expiresAt: ts("expires_at").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("sessions_token_uq").on(t.tokenHash)],
);

export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: id(),
    username: text("username").notNull(),
    ip: text("ip"),
    success: boolean("success").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("login_attempts_user_idx").on(t.username, t.createdAt)],
);

// ---------------------------------------------------------------------------
// Rate card (one per client)
// ---------------------------------------------------------------------------

export const rateCards = pgTable(
  "rate_cards",
  {
    id: id(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    imageRate: integer("image_rate").notNull().default(30000),
    videoRate: integer("video_rate").notNull().default(30000),
    leadRate: integer("lead_rate").notNull().default(20000),
    revisionRate: integer("revision_rate").notNull().default(10000),
    setupFee: integer("setup_fee").notNull().default(300000),
    freeRevisions: integer("free_revisions").notNull().default(2),
    maxVideoSeconds: integer("max_video_seconds").notNull().default(30),
    /** Items with amount strictly below this are sanctioned on creation. 0 = off. */
    autoSanctionLimit: integer("auto_sanction_limit").notNull().default(0),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("rate_cards_client_uq").on(t.clientId)],
);

// ---------------------------------------------------------------------------
// Work Items
// ---------------------------------------------------------------------------

export const workItems = pgTable(
  "work_items",
  {
    id: id(),
    number: integer("number").generatedAlwaysAsIdentity(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    type: workItemTypeEnum("type").notNull(),
    title: text("title").notNull(),
    brief: text("brief"),
    qty: integer("qty").notNull().default(1),
    rate: integer("rate").notNull(),
    amount: integer("amount").notNull(),
    status: workItemStatusEnum("status").notNull().default("draft"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    adminApprovedAt: ts("admin_approved_at"),
    adminApprovedBy: uuid("admin_approved_by").references(() => users.id),
    clientApprovedAt: ts("client_approved_at"),
    clientApprovedBy: uuid("client_approved_by").references(() => users.id),
    sanctionedAt: ts("sanctioned_at"),
    dueDate: text("due_date"),
    deliveredAt: ts("delivered_at"),
    acceptedAt: ts("accepted_at"),
    autoAccepted: boolean("auto_accepted").notNull().default(false),
    revisionCount: integer("revision_count").notNull().default(0),
    /** For type=revision: the creative this paid revision belongs to. */
    parentId: uuid("parent_id"),
    rejectionReason: text("rejection_reason"),
    invoiceId: uuid("invoice_id"),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("work_items_client_idx").on(t.clientId, t.status),
    index("work_items_invoice_idx").on(t.invoiceId),
  ],
);

export const attachments = pgTable("attachments", {
  id: id(),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id),
  workItemId: uuid("work_item_id")
    .notNull()
    .references(() => workItems.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: ["brief", "deliverable"] }).notNull(),
  /** Either an uploaded file (storageKey) or an external link (url). */
  storageKey: text("storage_key"),
  url: text("url"),
  fileName: text("file_name"),
  mimeType: text("mime_type"),
  sizeBytes: integer("size_bytes"),
  uploadedBy: uuid("uploaded_by")
    .notNull()
    .references(() => users.id),
  createdAt: createdAt(),
});

export const comments = pgTable("comments", {
  id: id(),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id),
  workItemId: uuid("work_item_id")
    .notNull()
    .references(() => workItems.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  text: text("text").notNull(),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------------------
// Leads
// ---------------------------------------------------------------------------

export const leads = pgTable(
  "leads",
  {
    id: id(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    workItemId: uuid("work_item_id").references(() => workItems.id),
    name: text("name"),
    phone: text("phone"),
    /** Digits-only phone used for duplicate detection. */
    phoneNormalized: text("phone_normalized"),
    answers: jsonb("answers").$type<Record<string, string>>().notNull().default({}),
    source: text("source").notNull().default("manual"),
    receivedAt: ts("received_at").notNull().defaultNow(),
    status: leadStatusEnum("status").notNull().default("new"),
    statusChangedAt: ts("status_changed_at"),
    isDuplicate: boolean("is_duplicate").notNull().default(false),
    duplicateOf: uuid("duplicate_of"),
    /** If this lead replaces a fake/wrong one, the replaced lead's id. */
    replacesId: uuid("replaces_id"),
    replacedBy: uuid("replaced_by"),
    invoiceId: uuid("invoice_id"),
    createdAt: createdAt(),
  },
  (t) => [
    index("leads_client_idx").on(t.clientId, t.receivedAt),
    index("leads_phone_idx").on(t.clientId, t.phoneNormalized),
  ],
);

// ---------------------------------------------------------------------------
// Billing
// ---------------------------------------------------------------------------

export const invoices = pgTable(
  "invoices",
  {
    id: id(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    number: text("number").notNull(),
    weekStart: text("week_start").notNull(), // YYYY-MM-DD (Monday, IST)
    weekEnd: text("week_end").notNull(), // YYYY-MM-DD (Sunday, IST)
    subtotal: integer("subtotal").notNull(),
    taxRateBps: integer("tax_rate_bps").notNull().default(0), // 1800 = 18%
    tax: integer("tax").notNull().default(0),
    total: integer("total").notNull(),
    status: invoiceStatusEnum("status").notNull().default("sent"),
    issuedAt: ts("issued_at").notNull().defaultNow(),
    dueDate: text("due_date").notNull(),
    paymentRef: text("payment_ref"),
    paymentSubmittedAt: ts("payment_submitted_at"),
    paidAt: ts("paid_at"),
    reminderSentAt: ts("reminder_sent_at"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("invoices_number_uq").on(t.number),
    uniqueIndex("invoices_client_week_uq").on(t.clientId, t.weekStart),
  ],
);

export const invoiceLines = pgTable("invoice_lines", {
  id: id(),
  invoiceId: uuid("invoice_id")
    .notNull()
    .references(() => invoices.id, { onDelete: "cascade" }),
  workItemId: uuid("work_item_id").references(() => workItems.id),
  kind: text("kind", { enum: ["work_item", "leads", "adjustment"] }).notNull(),
  description: text("description").notNull(),
  qty: integer("qty").notNull(),
  rate: integer("rate").notNull(),
  amount: integer("amount").notNull(),
});

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export const docTemplates = pgTable("doc_templates", {
  id: id(),
  type: docTypeEnum("type").notNull(),
  name: text("name").notNull(),
  body: text("body").notNull(), // Markdown with {{variables}}
  variables: jsonb("variables").$type<string[]>().notNull().default([]),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const documents = pgTable(
  "documents",
  {
    id: id(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    /** All versions of one document share a groupId. */
    groupId: uuid("group_id").notNull(),
    type: docTypeEnum("type").notNull(),
    title: text("title").notNull(),
    version: integer("version").notNull().default(1),
    content: text("content").notNull(),
    status: docStatusEnum("status").notNull().default("draft"),
    shareToken: text("share_token").notNull(),
    templateId: uuid("template_id"),
    sentAt: ts("sent_at"),
    viewedAt: ts("viewed_at"),
    acceptedAt: ts("accepted_at"),
    acceptedIp: text("accepted_ip"),
    acceptedName: text("accepted_name"),
    acceptedBy: uuid("accepted_by"),
    signedStorageKey: text("signed_storage_key"),
    expiresAt: text("expires_at"),
    supersededBy: uuid("superseded_by"),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("documents_share_uq").on(t.shareToken),
    index("documents_client_idx").on(t.clientId),
  ],
);

// ---------------------------------------------------------------------------
// Audit, notifications, settings
// ---------------------------------------------------------------------------

export const activityLog = pgTable(
  "activity_log",
  {
    id: id(),
    userId: uuid("user_id"),
    clientId: uuid("client_id"),
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    action: text("action").notNull(),
    before: jsonb("before"),
    after: jsonb("after"),
    ip: text("ip"),
    createdAt: createdAt(),
  },
  (t) => [index("activity_entity_idx").on(t.entity, t.entityId)],
);

export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    clientId: uuid("client_id"),
    event: text("event").notNull(),
    title: text("title").notNull(),
    href: text("href"),
    readAt: ts("read_at"),
    createdAt: createdAt(),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.readAt)],
);

/** Single-row-per-key settings store. Shape of each key is defined in src/lib/settings.ts. */
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type Client = typeof clients.$inferSelect;
export type RateCard = typeof rateCards.$inferSelect;
export type WorkItem = typeof workItems.$inferSelect;
export type Lead = typeof leads.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
export type InvoiceLine = typeof invoiceLines.$inferSelect;
export type Document = typeof documents.$inferSelect;
export type DocTemplate = typeof docTemplates.$inferSelect;
export type WorkItemStatus = (typeof workItemStatusEnum.enumValues)[number];
export type WorkItemType = (typeof workItemTypeEnum.enumValues)[number];
export type LeadStatus = (typeof leadStatusEnum.enumValues)[number];
export type DocType = (typeof docTypeEnum.enumValues)[number];
