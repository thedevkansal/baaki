-- Duplicates have to go before the index can exist.
--
-- A share used to insert a second, empty copy of the group every time: the
-- upsert had no conflict target, so it never conflicted. For any local id there
-- may be one populated row and several empty ones. Keep the row that actually
-- holds the ledger -- most bills, then most people, then the oldest -- and drop
-- the rest. Cascades take their (empty) children with them.
DELETE FROM "groups" g
USING (
  SELECT id, row_number() OVER (
    PARTITION BY local_id
    ORDER BY
      (SELECT count(*) FROM expenses e WHERE e.group_id = "groups".id) DESC,
      (SELECT count(*) FROM participants p WHERE p.group_id = "groups".id) DESC,
      created_at ASC
  ) AS rn
  FROM "groups"
) ranked
WHERE g.id = ranked.id AND ranked.rn > 1;--> statement-breakpoint
CREATE UNIQUE INDEX "groups_local_key" ON "groups" USING btree ("local_id");
