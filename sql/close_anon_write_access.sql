-- ============================================================================
-- CLOSE THE OPEN DOOR
--
-- Step 1 of the repair order, and the one that has to run first.
--
-- The problem, stated plainly: the anon role holds INSERT, UPDATE and DELETE
-- on tables that have row-level security switched off, and the anon key that
-- assumes that role was shipped inside the business dashboard's public
-- JavaScript bundle. Anyone who opened developer tools could copy it and write
-- to those tables from anywhere.
--
-- This file revokes those grants and turns RLS on. It is written to be read
-- before it is run: every statement below prints what it is about to do, and
-- section 0 shows you the damage first without changing anything.
--
-- ── Nothing the API does is affected ────────────────────────────────────────
--
-- gcr-api-clean connects with the service key, and the service role bypasses
-- row-level security by design. Every endpoint keeps working exactly as it
-- does today. What stops working is the business dashboard's direct writes
-- from the browser — which is the point, and which the dashboard cutover
-- replaces with calls to /api/business/*.
--
-- ── Order matters ───────────────────────────────────────────────────────────
--
-- Run this BEFORE deleting the database client from the dashboard, not after.
-- Deleting the client first does not retire the key: every browser that has
-- already cached the old bundle still has it, and it stays live until these
-- grants are gone.
--
-- Run in the Supabase SQL editor, which connects as the service role.
-- ============================================================================


-- 0. Look before you leap -----------------------------------------------------
-- Read-only. Run this on its own first and keep the output — it is the "before"
-- picture, and section 4 re-runs it as the "after".

SELECT
  c.relname                                        AS table_name,
  c.relrowsecurity                                 AS rls_enabled,
  (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid) AS policies,
  has_table_privilege('anon', c.oid, 'INSERT')     AS anon_insert,
  has_table_privilege('anon', c.oid, 'UPDATE')     AS anon_update,
  has_table_privilege('anon', c.oid, 'DELETE')     AS anon_delete
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND NOT c.relrowsecurity
  AND (has_table_privilege('anon', c.oid, 'INSERT')
       OR has_table_privilege('anon', c.oid, 'UPDATE')
       OR has_table_privilege('anon', c.oid, 'DELETE'))
ORDER BY 1;

-- The count that appears in the repair manual as "78 tables writable by
-- anyone". Whatever number this returns on the day you run it is the real one
-- — the list is discovered here rather than pasted from a report, so it cannot
-- go stale or miss a table added since.


-- 1. Revoke the write grants --------------------------------------------------
-- The blunt instrument, and the right one. anon has no business writing to any
-- table in this schema: every write in the platform goes through
-- gcr-api-clean, which uses the service key.

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA public FROM anon;

-- Reads are deliberately left alone. GCR Unified renders public listings with
-- the anon key, and revoking SELECT here would take the public site down.
-- Which tables anon may read is a separate decision — see section 5.


-- 2. Stop new tables from being born open -------------------------------------
-- Without this, the next `create table` re-opens the hole, because the default
-- privileges that granted anon these rights in the first place are still in
-- place.
--
-- Default privileges are per-granting-role. `postgres` and `supabase_admin`
-- are the two that create tables in a Supabase project; both are covered.

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLES FROM anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLES FROM anon;

DO $$
BEGIN
  EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
             REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLES FROM anon';
EXCEPTION WHEN undefined_object OR insufficient_privilege THEN
  RAISE NOTICE 'supabase_admin default privileges not adjustable here — skipped';
END $$;


-- 3. Belt and braces: turn RLS on ---------------------------------------------
-- The revoke above is what actually closes the door. This is the second lock:
-- with RLS on and no policy, a non-service role gets nothing even if a grant
-- comes back by some other route.
--
-- Discovered, not listed. Every table in `public` that still has RLS off gets
-- it turned on.
--
-- READ THIS BEFORE RUNNING: enabling RLS on a table with no policy makes it
-- invisible to anon, including for SELECT. If GCR Unified reads any of these
-- tables with the anon key, that page goes blank until section 5 gives the
-- table a read policy. Section 0's output tells you which tables are involved;
-- check them against what the public site renders.
--
-- If you would rather do this incrementally, replace the loop below with the
-- explicit form for one table at a time:
--
--   ALTER TABLE public.<table> ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t record;
  n int := 0;
BEGIN
  FOR t IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
    WHERE ns.nspname = 'public'
      AND c.relkind = 'r'
      AND NOT c.relrowsecurity
    ORDER BY 1
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.relname);
    n := n + 1;
    RAISE NOTICE 'RLS enabled: %', t.relname;
  END LOOP;
  RAISE NOTICE '--- row-level security enabled on % tables ---', n;
END $$;


-- 4. Confirm ------------------------------------------------------------------
-- Section 0's query again. It should now return zero rows.

SELECT count(*) AS tables_still_open
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND NOT c.relrowsecurity
  AND (has_table_privilege('anon', c.oid, 'INSERT')
       OR has_table_privilege('anon', c.oid, 'UPDATE')
       OR has_table_privilege('anon', c.oid, 'DELETE'));

-- And the grants themselves:

SELECT count(*) AS anon_write_grants_remaining
FROM information_schema.role_table_grants
WHERE grantee = 'anon'
  AND table_schema = 'public'
  AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE');


-- 5. What the public site still needs to read ---------------------------------
-- Only relevant if section 3 turned RLS on for a table GCR Unified reads
-- directly with the anon key. Give those tables — and only those — a read
-- policy. The dashboard needs none of this: it reads through the API, which
-- uses the service key.
--
--   ALTER TABLE public.<table> ENABLE ROW LEVEL SECURITY;   -- already done
--   DROP POLICY IF EXISTS <table>_public_read ON public.<table>;
--   CREATE POLICY <table>_public_read ON public.<table>
--     FOR SELECT TO anon, authenticated USING (true);
--
-- Two tables must NOT get a blanket read policy — they expose secrets and
-- personal data to the public key:
--
--   bookable_resources  → wifi_password, ical_export_token
--   song_requests       → fan_phone
--
-- Give those a column-limited view or an owner-scoped policy instead.


-- 6. Then ---------------------------------------------------------------------
-- ownership_and_write_access.sql sections 1–4 (ownership, admins, the
-- owns_entity() test, per-table owner write policies), if you have not run
-- them yet. They are independent of this file: this one closes anon's access,
-- that one describes what a signed-in owner may do. With every write going
-- through the API, the owner policies in section 4 of that file are belt and
-- braces too — the service key does not consult them.
