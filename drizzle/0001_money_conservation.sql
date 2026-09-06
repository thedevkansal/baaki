-- Money conservation, enforced by the database.
--
-- The TypeScript ledger already refuses to build an unbalanced expense, and
-- property tests prove it. This is the second lock: anything reaching the
-- database by another route, a migration, a script, a future service, still
-- cannot leave an expense whose payers and shares disagree.

ALTER TABLE "expense_payers"
  ADD CONSTRAINT "expense_payers_amount_non_negative" CHECK ("amount_minor" >= 0);
--> statement-breakpoint

ALTER TABLE "expense_shares"
  ADD CONSTRAINT "expense_shares_amount_non_negative" CHECK ("amount_minor" >= 0);
--> statement-breakpoint

-- A settlement of nothing is not a payment, and paying yourself is not a transfer.
ALTER TABLE "settlements"
  ADD CONSTRAINT "settlements_amount_positive" CHECK ("amount_minor" > 0);
--> statement-breakpoint

ALTER TABLE "settlements"
  ADD CONSTRAINT "settlements_distinct_parties"
  CHECK ("from_participant_id" <> "to_participant_id");
--> statement-breakpoint

CREATE OR REPLACE FUNCTION "baaki_assert_expense_balanced"() RETURNS trigger AS $$
DECLARE
  target uuid;
  paid bigint;
  owed bigint;
BEGIN
  target := COALESCE(NEW."expense_id", OLD."expense_id");

  -- The expense itself may have been deleted in this same transaction, which
  -- cascades these rows away. Nothing left to balance.
  IF NOT EXISTS (SELECT 1 FROM "expenses" WHERE "id" = target) THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(SUM("amount_minor"), 0) INTO paid
    FROM "expense_payers" WHERE "expense_id" = target;
  SELECT COALESCE(SUM("amount_minor"), 0) INTO owed
    FROM "expense_shares" WHERE "expense_id" = target;

  IF paid <> owed THEN
    RAISE EXCEPTION
      'expense % does not conserve money: payers total %, shares total %',
      target, paid, owed
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

-- Deferred to commit, so a transaction may insert payers and shares in any
-- order and is judged only on the state it leaves behind.
CREATE CONSTRAINT TRIGGER "expense_payers_balanced"
  AFTER INSERT OR UPDATE OR DELETE ON "expense_payers"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "baaki_assert_expense_balanced"();
--> statement-breakpoint

CREATE CONSTRAINT TRIGGER "expense_shares_balanced"
  AFTER INSERT OR UPDATE OR DELETE ON "expense_shares"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "baaki_assert_expense_balanced"();
