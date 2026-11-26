ALTER TABLE "clients" ADD COLUMN "doc_types" "doc_type"[] DEFAULT '{"contract","sow","nda","dpa","deposit"}' NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "format" text DEFAULT 'markdown' NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "file_key" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "file_name" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "file_mime" text;