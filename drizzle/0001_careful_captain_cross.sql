ALTER TABLE "events" ADD COLUMN "idempotency_key" varchar(100) NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_idempotency_key_unique" UNIQUE("idempotency_key");