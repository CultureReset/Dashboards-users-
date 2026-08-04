-- ============================================================================
-- THE FIRST OWNER
--
-- Step 4 of the repair order. Run it after the API's /api/business/* endpoints
-- are deployed and the dashboard is cut over.
--
-- entity_owners has 4,067 businesses and zero rows. That is not a bug in the
-- lock — the lock works. Nobody has been issued a key. Every endpoint behind
-- ownerRequired correctly answers "This account is not linked to a business"
-- because, correctly, no account is.
--
-- This file issues the first key: one row, for you, against one real business.
-- It is the first end-to-end proof that ownership, the API and the dashboard
-- all agree, and until it passes nothing else is verifiable.
--
-- Run in the Supabase SQL editor (service role, so RLS does not block it).
-- ============================================================================


-- 1. Find your auth account ---------------------------------------------------
-- Business dashboard accounts created by phone are filed under a derived
-- label, not a real address — 12515550100@business.invalid. Yours may be a
-- normal email if it was created by invite or by hand.

SELECT id, email, phone, created_at
FROM auth.users
ORDER BY created_at DESC
LIMIT 20;


-- 2. Pick a business ----------------------------------------------------------
-- Any real, active listing. Something with data already in it makes a better
-- test, because the dashboard should light up with sections immediately.

SELECT slug, name, city, entity_type, is_active
FROM public.entity
WHERE is_active
ORDER BY name
LIMIT 20;


-- 3. Make yourself an admin ---------------------------------------------------
-- Lets you open any business's dashboard with ?business=<slug>, and is what
-- GET /api/business/me reports as isAdmin.
--
-- Replace the email with your own.

INSERT INTO public.platform_admins (user_id, note)
SELECT id, 'platform owner'
FROM auth.users
WHERE email = 'you@yourdomain.com'
ON CONFLICT (user_id) DO NOTHING;


-- 4. Issue the ownership row --------------------------------------------------
-- The one row that turns every 403 into a 200. Replace both values.
--
-- entity_id is filled in from the slug rather than typed, so the two can never
-- disagree — middleware/ownerAuth.js reads entity_slug, and other code reads
-- entity_id.

INSERT INTO public.entity_owners (user_id, entity_id, entity_slug, role)
SELECT
  u.id,
  e.id,
  e.slug,
  'owner'
FROM auth.users u
CROSS JOIN public.entity e
WHERE u.email = 'you@yourdomain.com'   -- ← your account
  AND e.slug  = 'replace-with-a-slug'  -- ← the business
ON CONFLICT (user_id, entity_slug) DO NOTHING;


-- 5. Confirm ------------------------------------------------------------------
-- One row, pointing at a business that exists.

SELECT
  o.user_id,
  u.email,
  o.entity_slug,
  e.name,
  o.role
FROM public.entity_owners o
JOIN auth.users u  ON u.id = o.user_id
JOIN public.entity e ON e.slug = o.entity_slug;


-- Then open the business dashboard and check three things, in this order:
--
--   1. GET /api/business/me returns your slug and hasAccess: true
--   2. Sections load — that is GET /api/business/sections, one call replacing
--      the 316 the browser used to make
--   3. An edit saves — that is PATCH /api/business/:table/:id, with the slug
--      coming from your session rather than from anything the browser sent
--
-- If all three pass, the chain works and the remaining steps are ordinary work.
