ALTER TABLE "expenses" ADD COLUMN "local_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "local_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "participants" ADD COLUMN "vpa" text;--> statement-breakpoint
ALTER TABLE "participants" ADD COLUMN "local_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "participants" ADD COLUMN "claim_token" text;--> statement-breakpoint
ALTER TABLE "participants" ADD COLUMN "claimed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "participants" ADD COLUMN "device_id" text;--> statement-breakpoint
ALTER TABLE "settlements" ADD COLUMN "local_id" text NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "expenses_group_local_key" ON "expenses" USING btree ("group_id","local_id");--> statement-breakpoint
CREATE UNIQUE INDEX "participants_group_local_key" ON "participants" USING btree ("group_id","local_id");--> statement-breakpoint
CREATE UNIQUE INDEX "settlements_group_local_key" ON "settlements" USING btree ("group_id","local_id");--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_claim_token_unique" UNIQUE("claim_token");