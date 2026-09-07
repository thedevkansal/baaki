ALTER TABLE "participants" ADD COLUMN "role" text DEFAULT 'member' NOT NULL;--> statement-breakpoint
-- Groups made before roles existed have no admin, which left their creator
-- unable to remove anybody. The earliest person to claim a seat is the one who
-- shared the group, so they become its admin.
UPDATE participants p SET role = 'admin'
WHERE p.claimed_at IS NOT NULL
  AND p.claimed_at = (
    SELECT min(q.claimed_at) FROM participants q
    WHERE q.group_id = p.group_id AND q.claimed_at IS NOT NULL
  );--> statement-breakpoint
-- Same story for the owning device, added later than the groups it owns.
UPDATE groups g SET owner_device_id = (
  SELECT p.device_id FROM participants p
  WHERE p.group_id = g.id AND p.claimed_at IS NOT NULL
  ORDER BY p.claimed_at ASC LIMIT 1
) WHERE g.owner_device_id IS NULL;
