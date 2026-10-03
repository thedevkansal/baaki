-- Nothing reaches these tables through Supabase's Data API.
--
-- The anon key ships in every browser bundle, and Supabase grants the anon and
-- authenticated roles full access to new tables in public. With row level
-- security off, that key alone could read, rewrite or delete every group, bill
-- and settlement. Baaki never uses the Data API: the server talks to Postgres
-- directly as the owning role, which bypasses RLS, and decides who is asking
-- itself. So RLS goes on with no policies, which denies those roles everything,
-- and their grants go too, so a table that someone forgets to protect later is
-- still closed.

ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "payment_ids" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "groups" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "participants" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "expenses" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "expense_payers" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "expense_shares" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "settlements" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "nudges" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- The roles exist only on Supabase. Plain Postgres, and the tests, have neither.
DO $$
DECLARE
  api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', api_role);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', api_role);
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I',
        api_role
      );
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I',
        api_role
      );
    END IF;
  END LOOP;
END
$$;
--> statement-breakpoint

-- Pin where the balance trigger looks up its tables, so nobody earlier on the
-- search path can stand in for "expenses" and answer for it.
ALTER FUNCTION "baaki_assert_expense_balanced"() SET search_path = public, pg_temp;
