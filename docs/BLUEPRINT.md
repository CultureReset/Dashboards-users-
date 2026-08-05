# Dashboards-users- — The Complete Wiring Blueprint

A read-not-remembered teardown of the business dashboard. Every file, every
module, every call it makes into gcr-api-clean, every SQL proposal, and what is
live versus stale. Computed from the actual code on `main`
(HEAD `f323f55`, 2026-08-05), not from memory and not from this repo's own
README — which, as §14 records, describes an architecture the code no longer
has.

**Scope measured on disk:** 50 source files / 5,947 lines under `src/`
(24 JSX components + 14 lib modules + 2 stylesheets), 5 Node scripts /
1,479 lines, 5 SQL proposals / 766 lines, 4 config files, plus `docs/`
(PORT_REVIEW.md, the 344 KB `everything.html` record, 26 artist mockup pages).

This is the third of the four repos. It is the **newest and cleanest** of the
three front ends: it holds no database key, hardcodes no table list, and asks
the API what exists rather than being told at build time.

---

## 0. What this repo is

A Vite + React 19 single-page app. One business signs in, and everything about
that business is assembled at runtime from the live database schema.

**The one rule, stated in `src/lib/config.js`:**

> There is only one [host] now. This file used to carry the Supabase project URL
> and the anon key as well, which is what let the dashboard open the database
> directly from the browser — and what put a writable key inside a public
> JavaScript bundle where anyone could read it out of developer tools. Both are
> gone. If you find yourself adding a database host back to this file, the
> change is the wrong one: everything goes through gcr-api-clean.

That paragraph is the whole architecture. Commit `623d361` ("Take the database
key out of the browser") deleted `src/lib/supabaseClient.js` and rewrote the
data layer around an HTTP client; the app now has exactly one outbound host.

**The second rule — nothing is hardcoded per business or per industry.** There
is no list of features, no list of tables, no per-vertical branch. The app asks
`GET /api/business/schema` what tables exist, `GET /api/business/sections` which
of them hold rows for this business, and turns every answer into a screen. A
restaurant gets Menu / Hours / Happy Hour. A charter gets Species / Meeting
Points / Weather Rules. **Same code.** Add a table to Postgres tomorrow and it
appears with no deploy.

### The three repos it sits beside

| Repo | Who | Relationship |
|---|---|---|
| `gcr-api-clean` | — | The only thing that touches Postgres. This app's sole host. |
| `Admin-dashboard-main` | operator | Sibling. `apiClient.js` and `endpoints.js` are deliberately the same shape; `AppStoreView.jsx` is an **identical file** in both. |
| `gcr-unified` | tourist | Unrelated product. The fan-facing artist pages live there, not here. |

`README.md:1-13` is explicit that this repo was copied out of `admin-dashboard-`
because that name read as an admin tool and sat one hyphen from
`Admin-dashboard-main`, a different product. **This copy is the one to work on.**

---

## 1. Entry point & boot

### `index.html` (26 lines)

Standard Vite shell plus one inline script that matters: it reads
`localStorage['gcr_dashboard_theme']` and stamps `data-theme` on
`<html>` **before React boots**, so a business that chose dark doesn't get a
white flash on the sign-in screen. The comment names its own coupling — *"must
stay in sync with the key and modes in `src/lib/useTheme.js`"*. That is the one
duplicated constant in the repo.

### `src/main.jsx` (10 lines)

`createRoot` → `<StrictMode><App /></StrictMode>`. Nothing else.

### `src/App.jsx` (86 lines) — the router that isn't a router

There is no routing library. `Root()` is a decision tree evaluated on every
render, in this exact order:

1. **`loading`** → spinner.
2. **`?token=` in the URL** → `<AcceptInvite>`. *An invite beats everything
   else, including an existing session*: someone may open an invite link on a
   machine already signed in as another business. On completion the token is
   stripped with `history.replaceState` so a refresh cannot replay a used invite.
3. **No user** → `<SignUp>` / `<Claim>` / `<Login>` (local state picks which).
4. **Admin with no business selected** → `<BusinessPicker>`.
5. **No slug** → `<NoBusinessLinked>` (renders the email + a sign-out button —
   a state, not an error).
6. **Otherwise** → `<Dashboard>`.

`PORT_REVIEW.md` flags the consequence: no routing means `?business=` is read
once at mount and section state is lost on browser-back.

### `vite.config.js` (7 lines) / `package.json` (25)

React plugin only. Scripts: `dev`, `build`, `check`
(→ `scripts/check-discovery.mjs`), `lint` (oxlint), `preview`.

**Runtime dependencies are exactly two: `react` and `react-dom`.**
`@supabase/supabase-js` survives only as a *devDependency*, used by the two
provisioning scripts under Node — never by the bundle. That dependency list is
the machine-checkable proof of the architecture rule.

### `.env.example` (22 lines)

Three `VITE_*` variables, all optional because `config.js` carries working
defaults. The file closes with the rule spelled out:

> The `service_role` key is never a `VITE_` variable — anything prefixed `VITE_`
> is compiled into the browser bundle. `scripts/` read it from
> `SUPABASE_SERVICE_KEY` in the shell at run time, and the app itself never
> reads it at all.

---

## 2. The HTTP layer

### `src/lib/config.js` (28 lines) — every host, in one place

- `GCR_API_BASE` — `VITE_GCR_API_BASE || 'https://gcr-api-clean.vercel.app'`,
  trailing slashes stripped.
- `LOGIN_DOMAIN` — `biz.gulfcoastradar.com`. Businesses type a slug; Supabase
  Auth files them under `<slug>@<domain>`.
- `REQUEST_TIMEOUT_MS` — 30 s.

`const env = import.meta.env ?? {}` — the `?? {}` exists so this module can also
be imported by plain Node in `scripts/check-discovery.mjs`, where
`import.meta.env` does not exist.

### `src/lib/apiClient.js` (251 lines) — the only place that calls `fetch`

Deliberately the same shape as `Admin-dashboard-main/src/api/client.js`, *"so
the two stay recognisably the same code rather than drifting into two different
ideas of how a request is made."*

**`class ApiError`** carries `status`, `path`, `body`, `cause`, and four
computed predicates that the UI branches on:

| Getter | Means |
|---|---|
| `isMissingEndpoint` | 404 / 405 |
| `isAuthError` | 401 / 403 |
| `isNotLinked` | **403 specifically** — signed in, owns no business |
| `isNetworkError` | status 0 (timeout or unreachable) |

The 401/403 split is load-bearing and is honoured all the way down: **401 kills
the session; 403 is a screen.** `request()` calls `clearSession()` +
`notifyAuthFailure()` on 401 only.

**`buildQuery(params)`** drops `undefined`/`null`/`''` and expands arrays, so
callers pass optional filters straight through without pruning.

**The admin acting-slug injection (L164–174)** — the subtlest thing in the file:

```js
const acting = getActingSlug()
const withActing =
  acting && path.startsWith('/api/business/') && !query?.slug
    ? { ...query, slug: acting } : query
```

An admin viewing someone else's business owns nothing, so the server has no slug
to resolve for them. The slug is attached to **every** `/api/business/` call
rather than only the reads that took it as an argument — otherwise an admin can
see a business's data and gets a 403 the moment they try to change it. The
comment closes the loop: *"The server ignores this for everyone `platform_admins`
does not vouch for, so attaching it is never a grant."*

**Token renewal on 401 (L204–211)** — one retry against a freshly renewed token
before a 401 is believed. Guarded by `!formData`, because *a FormData stream
cannot be replayed*. The Supabase client used to do this internally; without it
a token that expired between two keystrokes would sign the owner out mid-edit.

**`send()` (L114–133)** — `AbortController` + timeout, plus external-signal
chaining. `body` is *omitted* rather than passed as `undefined`, because a GET
carrying one is invalid and some runtimes reject it outright.

Exports the `api.get/post/put/patch/del/upload` façade. **Nothing else in the
app calls `fetch`** — except `authStore.refresh()`, which cannot, because it
would recurse.

### `src/lib/endpoints.js` (86 lines) — the URL registry

No component and no lib module builds a URL by hand. Every entry is a function
of its parameters, so a route change in gcr-api-clean is a one-line edit here.
`seg()` percent-encodes each path segment.

**The complete call surface of this app — 22 endpoints across 4 routers:**

| Group | Endpoint | gcr-api-clean file |
|---|---|---|
| session | `GET /api/business/me` | `business-data.js` |
| signup | `POST /api/business-auth/phone` → `/verify` → `/register`; `GET /similar` | `business-auth.js` |
| signin | `POST /api/business-auth/signin` → `/signin-verify` | `business-auth.js` |
| password | `POST /api/business-auth/password` · `/refresh` · `/signout` | `business-auth.js` |
| invite | `GET /api/auth/invite/:token` · `POST /api/auth/accept-invite` | `auth.js` |
| data | `GET /api/business/schema` · `/sections` · `/industries` | `business-data.js` |
| data CRUD | `GET/POST /api/business/:table` · `PATCH/DELETE /api/business/:table/:id` | `business-data.js` |
| App Store | `GET /api/connections` · `POST /:toolId/connect` · `/refresh` · `DELETE /:toolId` | `composio.js` (ownerRouter) |
| public | `GET /api/gcr/entity/:slug` · `/entities` · `POST /api/gcr/claim` | `gcr.js` |

**Not one path in this list carries a business slug** except the public
`/api/gcr/entity/:slug` read. That is the client half of gcr-api-clean's
"the slug is never taken from the request" rule.

### `src/lib/gcrApi.js` (138 lines) — the pre-session calls

Everything that happens *before* there is a token, so every call passes
`{ auth: false }` — *"there is no token to attach yet, and sending an expired one
from a previous visit would only confuse the answer."*

`withDetail(error)` copies the API's extra error fields — `claim_instead`,
`hint`, `entity_slug` — off `ApiError.body` onto the error itself, which is how
`SignUp.jsx` renders "that business is already listed, claim it instead."

`findSimilarBusinesses()` swallows its own errors and returns `[]` — *"a warning
that fails to load must not block a sign-up."*

---

## 3. Session & identity

### `src/lib/authStore.js` (153 lines) — where the session lives

The header states what this file replaced:

> The Supabase browser client used to own all of this: it kept the tokens, it
> renewed them before they expired, and it told the app when they changed.
> Removing it from the bundle means the three jobs move here.

- **Storage** — `localStorage['gcr_business_session_v1']`, wrapped in try/catch
  so private browsing degrades to a session that doesn't survive reload rather
  than a crash.
- **Listeners** — `onSessionChange()`; a throwing listener cannot break sign-in.
- **`REFRESH_MARGIN_S = 60`** — renew a minute early so a call never races
  expiry.
- **Single-flight refresh (L98–135)** — `let refreshing = null` guards it.
  *"Several requests waking up to an expired token must not each spend the
  refresh token — the second one would be using a token the first has already
  rotated away."*
- **Failure semantics** — a non-OK response clears the session (the refresh token
  is spent or revoked, signed out is the truth); a *network* failure keeps it,
  because *"a network failure is not proof the session is invalid."* That
  distinction is the difference between a flaky connection and a forced logout.
- **`actingSlug` (L55–77)** — the admin's chosen business, module-level, fed to
  `apiClient`. The comment is careful: *"Naming it here changes no permission."*

### `src/lib/AuthContext.jsx` (179 lines) — who you are allowed to be

Both halves used to happen in the browser against Supabase directly: the client
held the session, and this file read `entity_owners` and `platform_admins`
itself. **Those two reads are now one call to `GET /api/business/me`.**

> The access answer was already trustworthy before; it was computed from tables
> the browser could not forge. What changed is that the browser no longer needs
> a database key to ask the question.

**`loadAccess()`** — a 403 is not a failure, it is the honest answer for an
account with no `entity_owners` row, and it resolves to
`{ slug: null, isAdmin: false, hasAccess: false }` rather than throwing.

**The three ways in:**

| Method | For |
|---|---|
| `signIn(identifier, password)` | invite/provisioned accounts — `POST /business-auth/password` |
| `signInWithPhone(phone, session)` | phone signups — the server already minted the session; this only stores it |
| `adoptSession(minted)` | sign-up completion |

`signInWithPhone`'s two trailing arguments are *"accepted and ignored so the
sign-in pages did not have to change in the same commit"* — a documented,
deliberate seam left by the cutover.

**`signOut()`** calls the API **first**, while the token is still attached, *"so
the refresh token is revoked rather than merely forgotten"*, then clears locally
regardless of the outcome.

**Admin override:** `gcrSlug = (isAdmin && adminSlug) || access?.slug || null` —
an admin viewing a business wins over their own ownership row, so support can
jump straight into any dashboard. `openBusiness`/`closeBusiness` push/pop
`?business=` via `history.pushState`.

`attempt(work)` preserves Supabase's `{ data, error }` return shape so the
sign-in pages were untouched by the rewrite.

---

## 4. The discovery engine — the heart of the repo

Five modules, ~600 lines, and they are the entire reason the app has no feature
list.

### 4.1 `src/lib/schemaDiscovery.js` (79) — what tables exist

Asks `GET /api/business/schema`. The header records exactly what changed:

> The question used to go straight to PostgREST's OpenAPI document with the anon
> key, which meant downloading the entire database schema into the browser on
> every load. […] The API computes the same answer server-side with the service
> key and caches it, so the reply is a short list rather than the whole database
> — and tables the browser was never allowed to see are included, because the API
> is the one reading them.

- `getCachedTables()` — `localStorage['gcr_entity_tables_v1']`, for instant
  first paint only; the live read always runs.
- `columnsByTable` — module-level, populated by `fetchEntityTables()`. Edit forms
  build themselves from this.
- `isEditableColumn(col)` — trusts the API's `editable` flag when present, falls
  back to a local `SYSTEM_COLUMNS` set (`id`, `entity_slug`, `entity_id`,
  `site_id`, `created_at`, `updated_at`, `search_vector`, `embedding`) for a
  cached column list from before the flag existed. **That set is a verbatim
  mirror of `SYSTEM_COLUMNS` in `gcr-api-clean/lib/businessTables.js`** —
  a known, undeclared duplication (§14).

### 4.2 `src/lib/entityTables.js` (67) — the rows for one slug

One call: `GET /api/business/sections`. The header is the clearest statement of
what the cutover bought:

> This used to be the most expensive thing the dashboard did: **316 separate
> PostgREST calls** from the browser, twelve at a time, on every page load […]
> The API resolves the business from the session, so the slug is no longer
> something the browser asserts. And **the 99 slug tables with row-level
> security on and no policy** — which returned an empty list to the browser,
> indistinguishable from "this business has nothing here" — come back with their
> real contents now.

`sessionStorage` cache, 5-minute TTL, keyed by slug. The `onProgress` callback
survives with nothing to report (`onProgress(total, total)`) purely because the
caller draws a progress bar with it — an honest vestige, commented as such.

### 4.3 `src/lib/tableMap.js` (116) — the rename bridge

`buildFullEntity()` in gcr-api-clean renames tables on the way out:
`entity_hours` → `hours`, `entity_offer_fee` → `fees`,
`entity_attributes` → `structured_attributes`, and ~40 more. That rename breaks
two things, both named in the header:

1. **Writes.** A section discovered from the API payload is keyed by the API's
   name, and PostgREST has no table called `hours` — every insert/update/delete
   would 404.
2. **Duplicates.** The sweep finds `entity_hours` independently, so with no
   mapping the dashboard shows both "Hours" and "Entity Hours" with the same rows.

`API_KEY_TO_TABLE` is a 73-entry map. Entries where both sides are identical
(`faqs: 'faqs'`, `offerings: 'offerings'`) are listed deliberately, *"so the
mapping reads as the full picture rather than looking like an oversight."*

`DERIVED_KEYS` — `industry_facts`, `parent`, `parent_amenities`, `module_keys` —
are assembled by the API with no table behind them, so `tableFor()` returns
`null` and the section renders read-only.

**Anything unlisted passes straight through**, which is what keeps discovery
open-ended: a table added tomorrow is swept, rendered and edited with no entry
here.

### 4.4 `src/lib/discoverSections.js` (196) — payload → sections

- `NOT_A_SECTION` — 23 metadata keys (`id`, `slug`, `search_vector`, `theme`,
  `google_places_data`, …) that are relationships or plumbing, not a data domain.
- `LABEL_OVERRIDES` — 40 nicer names where humanizing the column is wrong
  (`whats_excluded` → "What's Not Included", `bookable_resources` → "Units").
- `ICONS` — 32 emoji, falling back through `ARTIST_ICONS` to `📋`.
- **`hasData(value)`** — the discovery predicate. Arrays need length; objects
  need one non-empty value; **scalars return `false`** — *"scalars are profile
  fields, not sections."* That single line is why a business cannot edit its own
  name or phone anywhere in this app (§15).
- `NESTED_IN_PARENT` — 8 child tables (`menu_items`, `offering_prices`,
  `price_tiers`, `room_amenities`, …) the API already nests inside a parent.
  Showing them again would be a duplicate.
- **`mergeEntitySources(entity, tableRows)`** — the merge, in precedence order:
  skip nested children → skip `isInternal()` tables → skip if the API already
  supplied this table under its renamed key → skip if the API supplied it under
  its own name → otherwise adopt it. The `isInternal` guard carries a field
  report: *"Verified against a live business: without this, Flora-Bama's
  dashboard opens with `ai_photo_index_full` and `ai_entity_intent_tags_full` as
  sections."*
- `discoverSections(entity)` → `[{ key, label, icon, kind, data }]`, where `kind`
  is `'list'` or `'record'`.

### 4.5 `src/lib/sectionCatalog.js` (139) — what a business *could* add

The other half of discovery, and the answer to a real product failure:

> Discovery alone can only ever show a business the data it already owns: a table
> with no rows for this slug produces no section, so a restaurant with no menu
> has no Menu screen and no way to make one. That makes the dashboard a viewer
> of whatever happens to be in the database rather than something a business can
> actually build out.

**`INTERNAL_PATTERNS` (8 regexes)** — AI/derived indexes, embeddings/vectors,
access control (`entity_owners`, `platform_admins`), audit/log/click/analytics
tables, other people's Trip Swipe data (`user_`, `tourist_`, `swipe`), SMS and
notifications, backups/legacy/tmp/migration artifacts. **Hidden everywhere** —
not offered, not rendered.

The list is *deliberately narrow*, and the comment says why:

> Bookings, orders, reviews and song requests are **NOT** here: they are the
> business's data, they just arrive from customers rather than being authored.
> `detectInbox()` handles those — they render as sections and are only held back
> from "add".

That distinction — *machinery* vs *somebody else's submission* — is the sharpest
idea in the repo.

**`GROUPS`** — 13 keyword buckets, first hit wins, `Everything else` last.
Artist is checked **first** because its pattern is more specific than the
keyword buckets, *"which would otherwise pull `songs` into 'About & content'."*

**`buildCatalog(allTables, activeKeys, columnsFor)`** resolves `activeKeys`
through `tableFor()` before comparing, *"or the business is offered a table it is
already using under a different label."*

### 4.6 `src/lib/shapes.js` (192) — the domain-agnostic detectors

The design statement, from the header:

> The test is always: would a table nobody has ever heard of get the right
> treatment? A `merch_crowdfund` table added tomorrow, with a target and a
> running total, gets a progress bar here without anyone editing a map. […] That
> is the difference between configuration and hardwiring — configuration makes an
> unknown table look nicer, hardwiring makes it not work at all.
>
> **Everything below is domain-agnostic on purpose. None of it mentions artists.**

Five field-name vocabularies (`RAISED_RE`, `TARGET_RE`, `KIND_RE`, `LABEL_RE`,
`AMOUNT_RE`) describe how columns are *named* across the database, not which
tables exist.

| Function | Test | Guard against false positives |
|---|---|---|
| `detectProgress(rows, cols)` | a raised/target pair | the target must hold a **number** in some row — *"a `goal_type` text column must not be mistaken for a target"* |
| `detectPriceList(rows, cols)` | kind + label + amount | needs ≥2 rows and a money-shaped amount; a flat priced list deliberately does **not** qualify, because GenericSection already renders that well |
| `detectInbox(table, cols, rows)` | two independent signals: (1) carries somebody else's identity (`fan_name`, `contributor_phone`) or (2) the name says it collects submissions (`…_requests`, `…_leads`, `…_votes`, plus a booking/order/payment/review/waiver concept regex) | — |
| `isContactField(field, {ownRecord})` | `CONTACT_OWNER_RE` always; `CONTACT_FIELD_RE` only when **not** the business's own record | *"the same column name means different things depending on whose row it is"* |
| `maskContact(value)` | `sa•••@example.com`, `•••-•••-1234` | *"enough to recognise, not enough to misuse"* |
| `pickTitleField(rows, cols)` | 30 listed `TITLE_FIELDS`, then a `(name\|title\|label\|heading)$` fallback | skips plumbing that ends in `_name` but identifies something else (`entity_`, `site_`, `table_`, `file_`, `column_`) |

### 4.7 `src/lib/writeEntityData.js` (53) — every write, one door

Four functions: `createRow`, `updateRow`, `deleteRow`, `fetchRows`. The header
is the cleanest summary of what the cutover changed:

> It used to hold the client half of a security model — stamping the slug on
> inserts, filtering updates and deletes by it — and hope the database enforced
> the same thing independently. It does not need to any more. The slug is not
> sent at all now: gcr-api-clean resolves it from the session and puts it in the
> WHERE clause itself, where nothing in the request can reach.
>
> That is why these functions lost their `slug` argument. **There is no longer
> anywhere to put it, and no longer any point — the server was never going to
> believe it.**

`describe(error)` translates `isNotLinked` / `isNetworkError` into owner-readable
sentences.

---

## 5. Supporting libs

| File | Lines | What it is |
|---|---|---|
| `industries.js` | 72 | `PRESENTATION` (9 industries with label/icon/hint) is **presentation only** — which values exist is read live from `GET /api/business/industries`. A live value with no entry still shows, titled from its own slug. `PRESENTATION` doubles as the sign-up fallback, because that form runs before a session exists and `/industries` is owner-scoped. |
| `appStore.js` | 71 | Four calls to `/api/connections` + `groupByCategory` (built from what the tools actually carry, because *"a tool can carry several and plenty carry none"*) + `searchTools`. The Composio key never reaches the browser. |
| `artistModule.js` | 77 | **Naming, and nothing else.** 15 labels, 15 icons, one grouping regex, and `PRICE_KIND_LABELS`. The header: *"Losing this file entirely would make the dashboard uglier and change nothing about what works. […] This one is the artist's because that's the vocabulary that came up first, not because artists are special."* |
| `useTheme.js` | 52 | Three modes. `system` **removes** the attribute and hands the decision back to `prefers-color-scheme`; light/dark set it and win in both directions — *"a business that wants white at midnight gets white at midnight."* |
| `format.js` | 22 | `money()` (drops `.00`), `fmtTime()` (24h → 12h), `dayName()`. |

---

## 6. Screens (`src/pages/`)

### `Dashboard.jsx` (192) — the assembly point

Two independent effects, both keyed on `[gcrSlug, reloadKey]`:

1. **`fetchEntity(gcrSlug)`** → the API payload, richest source for the domains
   it covers.
2. **`fetchEntityTables()` → `fetchTablesForSlug()`** → the schema and the sweep.
   Cached rows paint instantly; the fresh read then **replaces wholesale**,
   *"which is what drops tables that no longer exist or no longer have data."*
   Discovery failures are swallowed on purpose — *"discovery is additive — if it
   fails the API-backed sections still work."*

`merged = mergeEntitySources(entity, tableRows)` → `sections = discoverSections(merged)`.
`allTables` is kept **whole**, not filtered to those with rows — that is the Add
catalog's input.

Renderer selection: `activeColumns = getColumns(tableFor(active.key) || active.key)`
then `rendererFor(active, activeColumns)`. Columns are passed so the renderer can
be chosen **from the table's shape rather than its name**.

Three mutually exclusive body states: `showApps` → `<AppStore>`, `adding` →
`<AddSection>`, otherwise `<EditableSection>` wrapping the chosen renderer.

### `Login.jsx` (177) — two ways in

`phone` (default) and `password`. Phone is default *"because it is the one that
needs nothing remembered."* The phone flow echoes back the server-normalised
number so the confirmation reads `+12515550100` rather than whatever shape was
typed. On verify: *"The server checks the code and mints the session itself, so
what comes back is the finished thing rather than a secret to redeem. Nothing is
typed by the owner, and no credential reaches this browser at all."*

### `SignUp.jsx` (278) — a brand-new business

Four steps: `phone → code → business → industry`, with a progress-dot row.
A debounced (400 ms) `findSimilarBusinesses()` runs **while they type the name**,
not after they finish — *"If one of these is you, claim it instead — you'll keep
the reviews and photos already there."* On a hard collision the API throws with
`claim_instead` attached and the screen renders it.

The fine print is honest about the gate: *"Your listing stays hidden from the
public site until we review it."* That matches
`business-auth.js /register`, which inserts the entity `is_active:false,
show_in_listings:false` and writes a `business_signups` row as `pending`.

### `Claim.jsx` (221) — claim an existing listing

Debounced search (300 ms) over `GET /api/gcr/entities`, then
`POST /api/gcr/claim`. The header is unambiguous about what it does **not** do:

> This does NOT grant access — `POST /api/gcr/claim` writes a `business_claims`
> row with status 'new' […] Approving there is what creates the account and the
> `entity_owners` row this dashboard reads access from, **so nobody can claim
> their way into another business's data.**

No match found is not a dead end — *"send the claim anyway and we'll add your
listing."*

### `AcceptInvite.jsx` (172) — the invited business

Token → `GET /api/auth/invite/:token` **before** showing the form, *"so an
expired or already-used link says so instead of taking a password and failing on
submit."* Then password (≥8, confirmed) → industry → `POST /accept-invite` →
immediate `signIn`. Failure copy names the policy: *"Invite links last 14 days
and can only be used once."*

### `BusinessPicker.jsx` (84) — the admin landing screen

Debounced (250 ms) `searchEntities`, each result opening
`?business=<slug>`. Goes through the API *"so the picker keeps working once the
open anon grants are revoked"* — a comment that has since come true.

### `AppStore.jsx` (104) — the connect queue

The interesting problem, stated in the header: *"The provider's OAuth screen
redirects to Composio and never back here, so nothing tells this page it
finished — the tab regaining focus is the signal."*

`queue = { ids, at, onDone }`. Each advance opens the next provider in a new tab;
a `window.addEventListener('focus', …, { once: true })` fires when the owner
comes back, calls `refreshTool(id)` to reconcile, reloads, and increments. A
failed refresh *"leave[s] it pending — they can retry."*

---

## 7. Components (`src/components/`)

### `AppStoreView.jsx` (393) — the shared catalog view

**An identical file in the business dashboard and the admin console.** Everything
that differs arrives as props: the host supplies the data and says what a row can
do. `curating = typeof onToggleOffer === 'function'` is the only mode switch —
admin gets toggle switches, business gets select/connect. *"Neither knows about
the other."*

Composio's 1,000+ toolkits decide the shape, and the header argues each choice:
list on phone (*"a two-column grid of cards at 390px gives every tool a postage
stamp and no room for what it actually does"*), grid on desktop, **paged not
infinite** (*"'page 3 of Marketing' is a place you can return to. An infinite
scroll position is not."*), and **pick-then-connect** (*"ticking is free;
authorising is not."*).

**The search (L100–139)** is the subject of commit `7e71840` and carries its own
post-mortem:

> It searched inside the selected category, so with a chip active you could type
> the exact name of a tool that exists and be told "Nothing matches" — true of
> that category, wildly untrue of the catalogue. […] And it matched descriptions
> equally with names, which sounds generous and reads as broken: in a catalogue
> of a thousand tools, "to" appears in "tool", "automate" and "customer", so
> short queries excluded almost nothing.

Result: a query searches **everything**, the chips go inert while it runs (*"letting
one look 'selected' would claim a filter that is not being applied"*), and hits
are ranked 0 = name/id prefix, 1 = name/id substring, 2 = description-only.

`Logo` falls back to a monogram coloured by a hash of `tool_id`, *"so a tool
looks the same on every render without anyone assigning it a colour."*
`DetailSheet` traps Escape and locks body scroll. `pageWindow()` renders a
±1 window with ellipses — *"forty buttons helps nobody."*

### `AddSection.jsx` (123) — the Add catalog screen

`buildCatalog(allTables, activeKeys, getColumns)` — passing `getColumns` is what
lets submission tables be recognised **by shape** rather than by being on a list.
Picking an entry opens `RowEditor` on that table; saving the first row is what
turns it into a live section. Renders an explicit error when the schema hasn't
loaded, rather than showing an empty form.

### `RowEditor.jsx` (153) — the self-building form

> Nothing here knows about menus or hours or charters — give it any table and it
> renders the right inputs, so tables added to the database later are editable
> with no new code.

`inputFor(col, …)` dispatches on the schema: `enum` → `<select>`; `boolean` →
Yes/No select; `integer`/`number` → numeric input; `date`/`time`/`timestamp` →
the matching native picker; a name matching
`/description|body|answer|notes?|content|summary|terms/i` → `<textarea rows=3>`;
otherwise text. `coerce()` turns form strings back into DB types on the way out
(`''` → `null`, `'true'` → `true`, parseInt/parseFloat).

### `TopBar.jsx` (129), `BottomNav.jsx` (39), `MainContent.jsx` (17)

`TopBar` is the hamburger: *"The bottom nav shows every discovered section, which
is fine for a restaurant with six and unusable for a business with twenty-five.
This is the other way through."* Outside-click and Escape listeners exist **only
while open**. Renders the `viewingAsAdmin` banner with a "← All businesses"
escape.

`BottomNav` — one tab per section, plus Tools (🧩) and a permanent Add (＋).
*"Add is always present, including when a business has no sections at all — that
is the whole point of it."*

`MainContent` — the empty state routes straight into the catalog: *"A business
with nothing entered yet is the normal starting state, not an error."*

---

## 8. Sections (`src/sections/`)

### `registry.jsx` (74) — three-step renderer selection

1. **`BY_KEY`** — 10 entries keyed on the *API's own payload keys*. Naming these
   is correct, not hardwiring: *"These are fixed shapes the API guarantees
   (hours as day-of-week rows, photos as an image grid)."*
2. **`BY_SHAPE`** — `[detectProgress → ProgressSection]`,
   `[detectPriceList → PriceListSection]`. *"A table nobody has heard of gets the
   right layout without being named anywhere."*
3. **`GenericSection`** — the universal fallback.

Each shape renderer **re-checks its own shape and returns `null`** if it doesn't
hold, so a false positive degrades to an empty panel rather than a crash.

> Nothing in this file decides which sections EXIST. Discovery does that.

### `EditableSection.jsx` (74) — add / edit / delete for any table

`table = tableFor(section.key)`; `null` means the API assembled this section and
there is nothing to write back to, so no controls render. `save()` carries the
one-line summary of the whole security change: *"No slug argument: the server
takes it from the session, which is the only copy that was ever trustworthy."*

### `GenericSection.jsx` (148) — the universal renderer

Works off the shape of the rows. Three field vocabularies —
`TITLE_FIELDS` (shared with `shapes.js`, so "what is this row called" is decided
once), `BODY_FIELDS`, `PRICE_FIELDS` — and `HIDDEN_FIELDS` for plumbing.

**Everything left over becomes a chip**, *"so no real data silently disappears
just because it wasn't anticipated."* That is a deliberate trade, and
`PORT_REVIEW.md` names its cost: it will happily print `wifi_password` and
`ical_export_token` off `bookable_resources` (§15).

`renderValue()` masks contact fields via `isContactField`/`maskContact`, with
`ownRecord: true` passed for the `record` layout so the business's own phone
stays readable. Rows carrying nested `items` render them recursively.

### The ten purpose-built renderers

| File | Lines | Renders |
|---|---|---|
| `ProgressSection` | 83 | raised/target bar + % chip; leftover columns as chips, skipping `*_id`/`*_at` **by shape, not by name** |
| `PriceListSection` | 76 | priced options grouped by kind; known kinds first in declared order, unknown kinds under their raw value; a null amount reads "Fan chooses" |
| `OfferingsSection` | 47 | the universal `entity_sections` pack — sections → items → price tiers |
| `HappyHourSection` | 41 | the `hh_*` time line off the entity row + sections; strikethrough original price |
| `MenuSection` | 32 | parameterised by `sectionsKey`, mounted twice (Menu, Drinks) |
| `EventsSection` | 26 | date-sorted, artist join, cover charge |
| `SpecialsSection` | 23 | discount text or computed `value + % off` |
| `ReviewsSection` | 21 | star glyphs, first 8, falls back to "Verified customer" |
| `HoursSection` | 20 | day-of-week sorted |
| `PoliciesSection` / `FaqsSection` | 16 each | `<details>` accordions |
| `PhotosSection` | 15 | `sort_order` scroll strip, lazy-loaded |

Every one returns `null` on empty data rather than an empty panel.

---

## 9. Styling

**`src/index.css` (830 lines, 190 classes).** A token sheet plus mobile-first
layout. `:root` defines 14 custom properties; the dark values are defined once
and applied by **both** `@media (prefers-color-scheme: dark)` and
`:root[data-theme='dark']`, which is what lets the three-mode switch win in both
directions. Two breakpoints only — 460px (industry grid) and 720px — with the
comment *"Wider screens are the enhancement, not the base case."*

Section blocks: loading · auth/claim cards · claim results · sign-up · the
six-digit code input (*"wide tracking so it reads as digits being entered"*) ·
the similar-business warning · invite setup · dashboard shell · hamburger ·
the three-way appearance switch (*"Auto is a real option, not a footnote"*) ·
bottom nav · artist prices/goals · add catalog · admin · panels · editing ·
universal renderer · App Store.

**`src/components/AppStoreView.css` (256 lines).** Self-contained `as-*`
namespace, imported by the component, so the shared view carries its own styling
into either host. Consumes the same `--` tokens, so it themes for free.

---

## 10. Scripts (`scripts/`, 5 files, 1,479 lines)

| Script | Lines | What it does | Network |
|---|---|---|---|
| `check-discovery.mjs` | 271 | `npm run check` | **none** |
| `provision-accounts.mjs` | 195 | create an Auth account + `entity_owners` row per active business | service key |
| `make-setup-links.mjs` | 94 | mint one-time Supabase recovery links per slug | service key |
| `reconcile-tables.mjs` | 377 | designed-vs-live table reconciliation | optional `--refresh` |
| `build-reconciliation-page.mjs` | 542 | render that output as one self-contained HTML page | none |

### `check-discovery.mjs` — the repo's only test, and a good one

64 assertions, no browser, no network, no database. It runs two realistic
payloads (a restaurant and a charter) through the **same** modules the app uses
and asserts the things that actually break:

- identical code produces **completely non-overlapping** section sets for the
  two businesses (asserted as `overlap.length === 0`)
- `entity_hours` does not become a second Hours section next to the API's `hours`
- the API version survives the merge (`hours[0].id === 1`)
- `menu_items` stays nested rather than duplicating
- `ai_photo_index_full` swept from the database is **not** rendered
- an unanticipated table (`song_requests`) still becomes its own section — and
  *is* shown, because it is the business's data
- every section resolves to a syntactically valid table name, or `null`
- an unknown table maps straight through
- 12 named internal tables are never offered in the catalog
- **shape detection on tables that appear nowhere in `src/`**:
  `merch_crowdfund` → progress, `sponsor_tiers` → price list, `wish_wall`
  (by its `patron_phone` column) and `venue_inquiries` (by its name) → held back
- contact masking by convention, including `phone` being readable on the
  business's own record and masked on a list row

That last block is the executable form of the README's claim that none of those
names appear in `src/`. It is the strongest guarantee in the repo.

### `provision-accounts.mjs`

Login address is `<slug>@biz.gulfcoastradar.com`; passwords are readable but not
guessable (`harbor-7Q4M-tide`). `--dry-run`, `--limit=N`, `--domain=`,
`--shared-password`. Safe to re-run: already-owned slugs are skipped, and an
"already registered" error from a partial run re-links instead of failing.

The `onConflict` comment is a hard-won detail: *"`entity_owners` has exactly one
[unique constraint]: `UNIQUE (user_id, entity_id)`. Naming any other pair makes
Postgres reject the statement outright […] which would fail every business rather
than skipping the ones already linked."*

Writes plaintext credentials to `business-credentials.csv` — gitignored, and the
script says *"treat this file as secret."*

### `reconcile-tables.mjs` / `build-reconciliation-page.mjs`

Reconcile a 244-table design registry against a live-database snapshot, emitting
`MISSING_TABLES.csv`, `UNDESIGNED_TABLES.csv`, `COLLISIONS.md` and a generated
`README.md`. Disposition heuristics: 19 `RENAMES` (one concept, two names),
`RETIRE_PATTERNS` for backups/legacy, `ai_` prefixed → keep-internal or retire,
empty → review, has slug → keep.

The generated README closes with a recommendation aimed straight at this app:

> The dashboard sweeps every slug table blindly and shows whichever ones come
> back with rows. It ignores `industry_table_contract`, which already records
> which tables each industry is supposed to have. Wiring the dashboard to that
> table would make sections reflect the design rather than whatever happens to
> hold data — and needs no schema change at all.

**Both scripts are currently unrunnable: `docs/reconciliation/` does not exist in
this repo.** See §15.

---

## 11. SQL proposals (`sql/`, 5 files, 766 lines) — none of them run from here

Every file opens by saying it is a proposal. They are the database half of the
security model, written to be read before executed.

| File | Lines | What it does | Status |
|---|---|---|---|
| `close_anon_write_access.sql` | 186 | revokes anon INSERT/UPDATE/DELETE and enables RLS | **appears done** — `gcr-api-clean/CLAUDE.md` records anon write grants on the live project as "revoked (0 tables)" |
| `ownership_and_write_access.sql` | 171 | locks `entity_owners`, creates `platform_admins` + `is_platform_admin()` + `owns_entity(slug)`, owner-scoped write policies on **8 starter tables** | proposal |
| `seed_first_owner.sql` | 97 | issues the first `entity_owners` row + first platform admin | proposal |
| `artist_module.sql` | 255 | the artist money layer: `songs.price`, 8 `artist_profiles` columns, `artist_price_tiers`, `tip_links` extensions, `entity_slug` backfills | proposal |
| `entity_sections.sql` | 57 | one `SECURITY INVOKER` function returning a slug's whole dataset as JSONB | **now consumed by the API** — `business-data.js:130` calls `entity_sections` RPC first and falls back to the sweep |

`close_anon_write_access.sql` states the ordering constraint precisely:

> Run this **BEFORE** deleting the database client from the dashboard, not after.
> Deleting the client first does not retire the key: every browser that has
> already cached the old bundle still has it, and it stays live until these
> grants are gone.

`artist_module.sql`'s thesis: `artist_price_tiers` is **one table behind every
money button** on the fan pages, keyed by `kind`
(request/shoutout/tip/crowdfund/addon), *"so a new kind of paid thing is a row —
not a schema change and not a deploy."* Its RLS split is two-way: the artist owns
their catalogue and prices; fan-submitted rows are insert-by-anyone,
manage-by-owner, with **no public SELECT** because they carry `fan_phone`,
`tourist_phone` and `contributor_phone`.

---

## 12. `docs/`

- **`PORT_REVIEW.md` (293)** — the review written when the app was ported out of
  `CyberCheckDashboardEverything.html`. Eight things fixed while landing it, the
  artist-module gap analysis, and three tiers of open issues. §15 records which of
  its claims are now stale.
- **`everything.html` (344 KB)** — the frozen full record: architecture write-up,
  extracted product spec, module-source analysis (OpenSyte / RentTools.io), the
  reconciliation of the 244-table design against the 563-table live database, both
  SQL proposals, and *"Source code — all 39 files."* The repo now has 50. This
  file is a snapshot from **before** the cutover.
- **`artist-mockups/` (26 HTML pages)** — the "Get Sideways Artist OS" standalone
  section mockups (live availability, song request, tip jar, paid shoutout,
  crowdfund, EPK, QR/NFC manager, payment verification, parser match log, …)
  plus four loose profile/linktree/request-flow pages. Design reference; nothing
  imports them.

---

## 13. External connection map

| Service | Reached how | Notes |
|---|---|---|
| **gcr-api-clean** | `apiClient` → `GCR_API_BASE` | **The only host the bundle talks to.** 22 endpoints, §2. |
| Supabase Auth | *indirectly* | Tokens are minted server-side by `business-auth.js` and merely stored here. The bundle never contacts Supabase. |
| Supabase (service role) | `scripts/*.mjs` under Node | `SUPABASE_SERVICE_KEY` from the shell, never a `VITE_` variable. Project ref `mkepugvdlktfsossumox` is hardcoded in three scripts. |
| Composio | *transitively* | Via `/api/connections`; the key is held by the API. The OAuth redirect opens in a new tab and never returns here — focus is the completion signal. |
| Twilio | *transitively* | The six-digit codes on every phone flow. |

**Zero third-party scripts, fonts, analytics or CDNs.** The bundle is React plus
this repo.

---

## 14. Honesty ledger

**Read in full, line by line, this pass:** all 50 files under `src/`
(14 lib modules, 7 pages, 5 components, 15 sections, `App.jsx`, `main.jsx`);
`check-discovery.mjs`, `provision-accounts.mjs`, `make-setup-links.mjs`,
`reconcile-tables.mjs`; `package.json`, `vite.config.js`, `index.html`,
`.env.example`, `README.md`, `docs/PORT_REVIEW.md`; and
`gcr-api-clean/routes/business-data.js`, cross-read to verify every claim this
app makes about the server.

**Characterized by role, not read line-by-line:** `build-reconciliation-page.mjs`
(read to L120 of 542 — the remainder is a generated HTML/CSS/JS template);
`src/index.css` and `AppStoreView.css` (structure, tokens and section comments
extracted, not every rule); the bodies of the 5 SQL proposals beyond their first
60 lines; `docs/everything.html` and the 26 artist mockups (characterized by
their headings — they are a frozen record and design reference, not live code).

**Known duplication, declared:** `SYSTEM_COLUMNS` in `schemaDiscovery.js:50-59`
is a verbatim copy of the same set in `gcr-api-clean/lib/businessTables.js`. It
is a documented fallback for stale caches, not an independent security check —
but it is a second copy of a list, and second copies drift.

---

## 15. Findings — drift, gaps, and what is genuinely still open

Sorted by how much they'd cost to get wrong.

### 15.1 `README.md` describes an architecture this repo no longer has

The README has not been touched since the initial commit (`dd52c69`), while
`623d361` rewrote the entire data layer. Six specific statements are now false:

| README says | Code does |
|---|---|
| "Direct PostgREST sweep of the GCR Supabase" as a data source | `entityTables.js` calls `GET /api/business/sections` |
| `schemaDiscovery.js` "Reads the live PostgREST OpenAPI spec every load" | reads `GET /api/business/schema` |
| `entityTables.js` "Tries the `entity_sections` RPC first; falls back to 12-at-a-time streaming requests" | one API call; the RPC fallback moved **into the API** |
| `writeEntityData.js` "Forces the business's own slug onto inserts; filters updates and deletes by slug" | the slug is **not sent at all** — the file says so explicitly |
| `config.js` — "API host, Supabase host and key, login domain" | Supabase host and key are deleted |
| Screens are "`Login`, `Claim`, `Dashboard`, `BusinessPicker`" | plus `SignUp`, `AcceptInvite`, `AppStore` |

The README also omits 10 of the 14 lib modules (`apiClient`, `authStore`,
`endpoints`, `shapes`, `industries`, `appStore`, `artistModule`, `useTheme`,
`format`, `discoverSections` is present but described by the old behaviour).

**This is the highest-value fix in the repo:** the README is what a new reader
trusts, and it currently teaches the pre-cutover model — including the idea that
the browser sweeps PostgREST, which is exactly the thing that was removed.

### 15.2 `PORT_REVIEW.md` claims that are now stale

Four of its open items have since been closed:

- **"Anon can still write"** — `CLAUDE.md` in gcr-api-clean records the live
  project at **0 tables** with anon write grants.
- **"Composio connections — no trace"** — now fully built:
  `appStore.js`, `AppStore.jsx`, `AppStoreView.jsx`, `AppStoreView.css`.
- **"`sql/entity_sections.sql` was written but never called"** — the API calls it
  (`business-data.js:130`).
- **"Row limits truncate: the sweep caps at 200 rows, the RPC at 500"** — the API
  now uses `ROW_LIMIT = 500` on both paths. *Truncation is still silent* on
  `/sections`, so the substance of the complaint stands; the numbers don't.

Two are stale **in location only** — they moved to the server and are still true:

- **"An owner of two businesses only ever sees one."** The `.limit(1)` on
  `entity_owners` now lives at `business-data.js:70` and still takes `[0]`. A
  multi-property owner (the API has a whole `parent_entity_slug` / `is_hub`
  concept for exactly this) still sees one business and has no picker.
- **"A failed schema read disables all editing, silently."** `Dashboard.jsx:82`
  still swallows discovery errors on purpose, so `getColumns()` returns `[]` and
  every editor says "This table has no editable fields" with no indication why.

### 15.3 Still genuinely open

- **A business cannot edit its own profile.** `hasData()` returns `false` for
  scalars (`discoverSections.js:137`), so name, phone, description, hero image,
  website, booking URLs, social links and price range are not editable anywhere
  in this app. This is the single largest functional gap.
- **Nested rows are read-only.** `EditableSection` edits the *section* row;
  `menu_items`, `drink_items`, `happy_hour_items`, `entity_section_items`,
  `offering_prices` and `price_tiers` arrive nested with no editor. **Adding a
  dish to a menu — the most common edit a restaurant makes — is not possible.**
  `RowEditor` already builds itself from any table's columns, so this is a matter
  of letting a nested list open one.
- **The Add catalog offers ~200 tables; `ownership_and_write_access.sql` opens
  8.** If that SQL is the operative policy, most things a business picks will
  fail at save time after they have typed. Either widen the list or have the app
  check writability and present those sections read-only.
- **`GenericSection` will print secrets.** Its "everything left over becomes a
  chip" rule is deliberate, and `PORT_REVIEW` names the cost: `bookable_resources`
  carries `wifi_password` and `ical_export_token`. Contact *masking* is by
  convention; there is no secret-column suppression.
- **`entity_owners.user_id` holds three id spaces.** `platform.js` writes a
  CyberCheck `businesses.id`; `provision-accounts.mjs` writes a GCR
  `auth.users.id`; `ownership_and_write_access.sql` enforces `user_id =
  auth.uid()`. Every ownership row written by the older platform path fails the
  proposed policy. Settle this **before** running the SQL.
- **`entity_modules` is ignored.** The API already sends `modules` and
  `module_keys` per entity, and `discoverSections` explicitly lists both in
  `NOT_A_SECTION`. Module-gating of which sections a business sees is available
  today and unused — the cheapest available improvement.
- **No image upload.** Photos are URL-only.
- **No error boundary, no routing, no CI.** A render error blanks the page.

### 15.4 Repo hygiene

- **`docs/reconciliation/` does not exist**, so both `reconcile-tables.mjs` and
  `build-reconciliation-page.mjs` throw on their first `readFileSync`. Their
  inputs (`CyberCheck_Complete_Table_Registry.csv`, `live_tables.csv`) are not
  checked in; the *output* survives only as frozen HTML inside
  `everything.html`. Either commit `docs/reconciliation/source/` or mark both
  scripts as archival.
- **`docs/everything.html` says "all 39 files"**; there are now 50.
- **The Supabase project ref `mkepugvdlktfsossumox` is hardcoded** in
  `provision-accounts.mjs`, `make-setup-links.mjs` and `reconcile-tables.mjs`,
  while every host in `src/` is configurable. Not a security issue (they need a
  service key from the shell regardless) but an inconsistency worth knowing.
- **The theme key `'gcr_dashboard_theme'` is written twice** — `index.html`'s
  inline pre-paint script and `useTheme.js`. The coupling is commented at both
  ends.

---

## 16. What this repo is, in one paragraph

`Dashboards-users-` is the business-facing dashboard: one owner, one business,
identified by a slug they never send. It holds no database credential, no table
list and no per-industry branch — it asks gcr-api-clean what tables exist, which
of them have rows for this business, and what columns each one has, then builds
the navigation, the screens and the edit forms from those three answers. Sections
that need a specific layout get one by *shape* (a raised/target pair is a
progress bar, a kind/label/amount triple is a price list) rather than by name, so
a table invented tomorrow renders correctly and is offered in the Add catalog
with no deploy — a property its own test suite asserts against table names that
appear nowhere in the source. What it cannot do yet is edit the business's own
profile row or any nested child row, which together are most of what a restaurant
actually wants to change; and its README still describes the browser-holds-the-key
architecture that commit `623d361` deleted.

---

*Companion papers: `gcr-api-clean` (the API spine, §0–11 + Appendices A–S).
Still to write: `gcr-unified` (tourist front end), `Admin-dashboard-main`
(operator console), then the four-repo interconnection map.*
