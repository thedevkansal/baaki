ALTER TABLE "expenses" ALTER COLUMN "local_id" SET DEFAULT gen_random_uuid()::text;--> statement-breakpoint
ALTER TABLE "groups" ALTER COLUMN "local_id" SET DEFAULT gen_random_uuid()::text;--> statement-breakpoint
ALTER TABLE "participants" ALTER COLUMN "local_id" SET DEFAULT gen_random_uuid()::text;--> statement-breakpoint
ALTER TABLE "settlements" ALTER COLUMN "local_id" SET DEFAULT gen_random_uuid()::text;