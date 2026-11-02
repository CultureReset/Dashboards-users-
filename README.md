# Business dashboard

> Status: current — last verified against code 2026-11-02 (branch `main`, commit f811332)

> **This README describes the `main` branch**, which is the line that has been developed since
> 2026-10-30. GitHub's default branch (`claude/dashboard-inventory-purposes-m5wtba`) is 23
> commits behind it and its README describes that older line. Which of the two Vercel builds is
> unverified.

## What it is

**The dashboard a business owner logs into: one business, identified by its
slug.** A static, phone-first React 19 / Vite 8 app (no router, bottom bar instead
of a sidebar, oxlint). Its sections are generated from the database schema via the
API, merged with the business's enabled modules (`GET /api/owner/modules`), not
hardcoded per business or industry. It is not the operator console; that
is `Admin-dashboard-main`.

The package is still called `dashboard-shell` (it was copied from the repo
`admin-dashboard-`); treat this repo as the one to work on. Production:
`dashboards-users.vercel.app` (unverified from here).

## Where it fits

**Ecosystem rule: only `gcr-api-clean` touches the live cloud database** (Supabase
project `cyber check`, ref `mkepugvdlktfsossumox`). This app, the operator console
and `gcr-unified` call only that API. This app holds no database key and opens no
database connection. The home machine has its own local Supabase, separate from this.

- **Calls**: `gcr-api-clean` through `src/lib/apiClient.js` (session token from
  `/api/business-auth`, kept in `localStorage`). Which business you are comes from the
  session; the browser sends no slug, except that an admin acting as a business, or an owner
  with several linked units, adds `?slug=` on `/api/business/*` calls, which the API checks
  against `entity_owners` / `platform_admins`. Separately, the **Platform**
  tab logs in to a separate Paperclip server through the `api/paperclip/[...path].js`
  edge function (forwards `/api/paperclip/*` to `PAPERCLIP_SERVER_URL`; answers 503 when
  unset; the clean version forwards every method and path it is given).
- **Called by**: nobody. The operator console links here ("View as", `?business=<slug>`).
- In the Ghost system this is a cloud-side screen. It never talks to a Ghost box
  directly: "My Ghost" queues a request at the API, the box pulls it over its own
  outbound link and posts the answer back (`src/pages/Ghost.jsx`).

| Store | My Ghost |
| --- | --- |
| ![Store: an update is ready, another app is available](docs/images/store.png) | ![My Ghost: the business's box, online, with a command bar](docs/images/my-ghost.png) |

*Captured against a test backend with sample data (one installed app with an
update waiting, one free app available, one online box).*

**Store** shows what the operator made available to this business (free, in its
plan, or granted), lets it install, switch off, configure and remove apps, and
pull updates. An update that asks for more access is never applied without the
owner saying yes. **My Ghost** is the business's own box, reachable from anywhere
through the relay: enrol a box (the page shows a one-time token to put in
`~/.config/ghost/ghost.env` as `NEXTGENT_NODE_TOKEN`), see it online, tell it
what to do, see whether it needs a YES text and the verified result; the example
phrases it suggests come from the box itself. **Automations** lists what the
operator pushed to this business. **Tools** connects third-party accounts
(Composio) through `/api/connections`.

![Where this repo sits in the whole system](docs/images/where-it-fits.png)

---

Every business gets sections built from its own data. Nothing is hardcoded per
business or per industry.

A business is identified by its **slug** (`flora-bama-yacht-club`). Everything
about it lives in tables carrying an `entity_slug` column. The dashboard has no
list of features: it asks the database what tables exist, pulls the rows
belonging to that slug, and turns every table that has data into a section. A
restaurant ends up with Menu, Hours, Happy Hour. A charter ends up with Trips,
Species, Meeting Points, Weather Rules. Same code, different data.

Add a table to the database and it appears in every business that has data in
it. Drop it and the section disappears. No deploy, no code change.

The business decides what goes in their dashboard. The **Add** tab lists every
slug table the schema supports that they aren't using yet — grouped, searchable,
including tables nobody has written any code for. Pick one, fill in the form
built from that table's columns, and it becomes a live section. A business with
nothing entered starts from that catalog rather than an empty screen.



## Branches

`main` (46 commits, tip f811332, 2026-10-30) is the line this README describes. It is **23 commits
ahead of and 1 behind** GitHub's default branch `claude/dashboard-inventory-purposes-m5wtba`
(24 commits, tip aac903f). The 23 commits are PRs #5 to #15: module-driven navigation, email and
password sign-in, the admin "View as" pass exchange, the Song Request and Merch Store apps,
owner-menu cleanup, a public link page and a `vercel.json`; the diff against the default branch is
31 files, +1,885 / -287. Other branches with unmerged work (commits ahead of the default):
`claude/dashboard-folder-structure-wqsm9i` +5, `claude/new-session-66c2e9` +3 (a Settings page),
`claude/modular-booking-platform-wdq0kk` +2, `claude/admin-dashboard-repo-review-47q2vc` +2,
`claude/repo-inventory-audit-5zw4yw` +1, `codex/paperclip-ghost-ui` +1 (open PR #3), `auth/supabase-oauth` +1.
Branch counts drift; run `git ls-remote --heads origin`.

What changed on `main` relative to the default branch:

| Area | `main` |
| --- | --- |
| Sign-in | Email and password only (`Login.jsx`), with forgot password (`POST /api/business-auth/forgot-password`, a Supabase recovery link) and `ResetPassword.jsx` for the `#access_token=...&type=recovery` return link. Phone-code sign-in and sign-up were removed from the UI; the API's phone routes remain. |
| Sign-up | `SignUp.jsx`: email, password, business name, optional website, industry, then `POST /api/auth/business-signup`, then a normal password sign-in. |
| Admin "View as" | `AuthContext.jsx` reads `?pass=`, calls `POST /api/business-auth/exchange-impersonation` once, stores the minted session (no refresh token), sets the slug, strips `pass` from the URL. `TopBar` shows "Viewing as admin" with Exit. A failed exchange shows an "Admin link" error screen. |
| Navigation | `src/lib/moduleNav.js` and `modulesApi.js` merge the data-discovered sections with `GET /api/owner/modules` (enabled modules without rows get an empty-state tab, `EmptyModulePanel`). If the endpoint answers 404, 405, 501 or 502 the dashboard falls back to discovery-only navigation. |
| Apps | `src/apps/song-request` and `src/apps/merch-store`: owner settings screens and guest popups, calling `/api/apps/<id>/<slug>/...` on the API. |
| Public page | `/?page=link&slug=<slug>` renders `PublicLinkPage.jsx` without a session from `GET /api/public/link-page/:slug`; its buttons open the guest popups. |
| Hosting | `vercel.json` with a single SPA rewrite; `public/claim-business.html` redirects old invite links to the root. |

## Run and test

```bash
npm ci
npm run dev      # http://localhost:5173
npm run build    # production build into dist/
npm run check    # scripts/check-discovery.mjs: discovery and table-mapping checks, no network
npm run lint     # oxlint
```

Results on 2026-11-02, Node 22 with `npm ci`, at commit f811332: `npm run lint` passes (0
errors, 4 warnings), `npm run check` prints 94 passing lines and "All checks passed", `npm run build` passes (JS 327 KB, 97 KB gzipped).
There is no CI workflow, no unit-test runner and no `verify` script. Nothing has been
exercised in a browser against the live API in this pass.

Deploy `dist/` anywhere static. Settings (all optional, copy `.env.example` to
`.env.local`): `VITE_GCR_API_BASE` (defaults to `https://gcr-api-clean.vercel.app`),
`VITE_LOGIN_DOMAIN` (defaults to `biz.gulfcoastradar.com`; vestigial, nothing builds an address from it) and `VITE_REQUEST_TIMEOUT_MS`
(defaults to 30000). The Paperclip proxy needs `PAPERCLIP_SERVER_URL` on the deployment;
for local dev `vite.config.js` proxies `/api/paperclip` to `PAPERCLIP_DEV_SERVER`
(default `http://localhost:3100`).

## Where the data comes from

| What | Endpoint |
| --- | --- |
| Who you are, what you own, admin or not | `GET /api/business/me` |
| Which tables can be sections, and their columns | `GET /api/business/schema` |
| Every section that has rows, in one call | `GET /api/business/sections` |
| Create / update / delete a row | `POST/PATCH/DELETE /api/business/:table[/:id]` |
| Sign in with email and password, refresh, sign out, forgot and reset password | `POST /api/business-auth/password`, `/refresh`, `/signout`, `/forgot-password`, `/reset-password` |
| Self-serve sign-up | `POST /api/auth/business-signup`; `GET /api/business-auth/similar` (warns about duplicate names) |
| Admin "View as" pass to a session | `POST /api/business-auth/exchange-impersonation` |
| Enabled modules and which have data | `GET /api/owner/modules` (read only; installing is through the Store) |
| Song Request and Merch Store | `/api/apps/song-request/:slug/...`, `/api/apps/merch-store/:slug/...` |
| Public link page for a slug | `GET /api/public/link-page/:slug` |
| The business's public listing payload (`Dashboard.jsx`) | `GET /api/gcr/entity/:slug` |
| Industry list, read live once signed in (the sign-up form uses a built-in list, since no session exists yet) | `GET /api/business/industries` |
| Calendar (iCal feed and imports) | `/api/business/ical` (`Calendar.jsx`) |
| Invite links | `GET /api/auth/invite/:token`, `POST /api/auth/accept-invite` |
| Claim a business | `GET /api/gcr/entities?search=`, `POST /api/gcr/claim` |
| Tools (Composio connections) | `/api/connections` (`GET`, `:toolId/connect`, `:toolId/refresh`, `DELETE :toolId`) |
| Store | `/api/store` (`GET`, `:id/install`, `:id/update`, `:id/disable`, `:id/enable`, `DELETE`, `PATCH :id/config`) |
| My Ghost | `/api/nodes` (enrol, list, send a request, read the answer) |
| Automations | `/api/business/automations` |

Hosts live in `src/lib/config.js`; every path lives once in `src/lib/endpoints.js`.

### The API renames tables

`buildFullEntity()` in gcr-api-clean reshapes some tables before sending them —
`entity_hours` arrives as `hours`, `entity_offer_fee` as `fees`. `src/lib/tableMap.js`
maps those names back, which is what lets an API-supplied section be edited (the
write has to name a real table). Anything not in the map is assumed to already be
a real table name, so a table added tomorrow still works untouched.

## The files that matter

**Engine — `src/lib/`**

| File | What it does |
|---|---|
| `schemaDiscovery.js` | Asks `GET /api/business/schema` which tables carry an `entity_slug` and what their columns are, so edit forms build themselves. |
| `entityTables.js` | Loads every section that has rows with one call to `GET /api/business/sections` and caches it for five minutes. |
| `discoverSections.js` | Turns raw results into sections. Merges the API payload with the swept tables, labels and icons them. |
| `sectionCatalog.js` | The other half — everything the business *could* add but isn't using yet. Internal tables (AI indexes, access control, audit/log/analytics tables, other people's Trip Swipe data, SMS/message tables, backups) are hidden everywhere. Tables that other people write to (bookings, orders, customers, requests, leads and the like) still show as sections once they have rows but are never offered under Add. |
| `tableMap.js` | API payload key ↔ real table name. |
| `gcrApi.js` | The gcr-api-clean calls for entity search, claim, sign-up, forgot and reset password and invites. |
| `moduleNav.js` / `modulesApi.js` | Module key to section mapping (aliases `gallery` to `photos`, `menu` to `menu_sections`), the merge of enabled modules with discovered sections, and the fetch of `GET /api/owner/modules`. |
| `writeEntityData.js` | **Every write goes through here.** It sends no slug: the API takes the business from the session and puts it in the WHERE clause itself. |
| `AuthContext.jsx` | Sign in, session, access. Resolves which business you are from `entity_owners`, admin status from `platform_admins` — both server-side. |
| `config.js` | The API host, the sign-in login domain and the request timeout. No database host or key. |
| `apiClient.js` / `endpoints.js` | The fetch wrapper (session token, typed errors) and every API path, once. |
| `authStore.js` | Where the session lives (`localStorage`), token renewal, and the slug an admin is acting on. |
| `shapes.js` | Works out from a table's columns and rows whether it is a progress bar, a price list or a fan-submitted inbox, and masks other people's contact details. |
| `appStore.js` / `automations.js` / `calendar.js` / `paperclip.js` / `industries.js` / `useTheme.js` | Calls and helpers for Tools, Automations, the Calendar, the Paperclip proxy, the industry list and the light/dark/auto theme. |

**Screens — `src/pages/`** — `Login`, `SignUp`, `ResetPassword`, `AcceptInvite`, `Claim`, `PublicLinkPage` (no session needed), `Dashboard`, `BusinessPicker` (admin only), `Store`, `Ghost` (My Ghost), `Automations`, `AppStore` (Tools, the Composio connections), `Calendar` (iCal import and export), `Platform` (Paperclip login and store, through `api/paperclip`).

**Layout — `src/components/`** — `TopBar`, `BottomNav` (one tab per discovered
section plus seven fixed tabs: Calendar, Tools, Platform, Store, My Ghost, Automations and Add; mobile-first, no sidebar), `MainContent`,
`AddSection` (the catalog), `RowEditor` (builds a form from a table's columns),
`AppStoreView` (the Tools list), `EmptyModulePanel` (an enabled module with no rows yet).

**Apps — `src/apps/`** — `song-request/` and `merch-store/`, each with `api.js`, `OwnerSettings.jsx` and `GuestPopup.jsx`; `Dashboard.jsx` shows the owner screen when the active tab is `song-request`, `merch-store` or `shop`.

**Sections — `src/sections/`** — `GenericSection` renders *any* table by
inspecting the shape of its rows. `registry.jsx` maps a handful of purpose-built
renderers; it does **not** define which sections exist — discovery does.

## Artist module

Artists are businesses like any other — same slug, same discovery, same editor.
Most of the module already exists in the database (`artist_profiles`, `songs`,
`song_requests`, `shoutouts`, `artist_goals`, `song_cooperatives`, `tip_links`,
`artist_shows`, `artist_follows`, `artist_booking_requests`).

What did not exist is the part the artist needs to control: **what anything
costs.** `sql/artist_module.sql` adds it (the file's own header calls it a
proposal: "NEVER RUN") —

| Thing | Where the artist sets it |
|---|---|
| Price per song | `songs.price` (falls back to `artist_profiles.default_min_request_amount`) |
| Custom-song price | `artist_profiles.custom_song_price` |
| Shoutout tiers | `artist_price_tiers` where `kind = 'shoutout'` |
| Tip buttons | `artist_price_tiers` where `kind = 'tip'` |
| Crowdfund amounts | `artist_price_tiers` where `kind = 'crowdfund'` |
| Crowdfund targets | `artist_goals`, `song_cooperatives` |
| Cash App / Venmo / PayPal | `tip_links` (platform, handle, deep-link prefix) |
| Requests open right now | `artist_profiles.requests_open` |

`artist_price_tiers` is one table behind every money button on the fan pages, so
a new kind of paid thing is a row — not a schema change and not a deploy.

**Nothing about this is hardwired.** `src/lib/artistModule.js` contains only
nicer words — labels, icons, and a name pattern for catalog grouping. It is
imported by `discoverSections.js`, `sectionCatalog.js` and `PriceListSection.jsx`, so
it cannot simply be deleted: removing it breaks the build. What it holds is only labels,
icons and a name pattern, so emptying it would leave the dashboard working with
"Artist Price Tiers" instead of "Prices". Every decision that matters is made from the live schema and the
shape of the rows, in `src/lib/shapes.js`:

| Decision | How it's made |
|---|---|
| Which sections exist | Tables with rows for this slug |
| What you can add | Every slug table you aren't using yet |
| Progress bar or not | Row has a raised/target numeric pair |
| Price layout or not | Rows have a kind + label + amount |
| Held back from Add | Row carries somebody else's identity, or the name says it collects submissions |
| Contact masking | Field name matches a contact convention |

A `merch_crowdfund` table invented tomorrow gets a progress bar. A
`sponsor_tiers` table gets the grouped price layout. A `wish_wall` table with a
`patron_phone` column is recognised as fan-submitted and held out of the Add
catalog with its phone numbers masked. None of those names is used in the code: the only
mentions in `src/` are two example comments in `src/lib/shapes.js`. `npm run check`
(`scripts/check-discovery.mjs`) feeds the detectors tables invented like these and
asserts they get the right treatment.

Fan-submitted tables still show as sections once they have rows (that's the
artist's queue); they're just never offered as something to *add*, because the
artist isn't the author.

**The fan-facing pages live in `gcr-unified`, not here** — `/artist/:slug` and
`/artist/:slug/live`. They currently hardcode their amounts; once this SQL is
run they should read `artist_price_tiers` and `tip_links` instead. See
`docs/PORT_REVIEW.md`.

## Access

Which business you are, and whether you are an admin, is decided by
`gcr-api-clean` from your session: `entity_owners` links a login to a business,
`platform_admins` lists admins. The database functions `owns_entity` and
`is_platform_admin` from `sql/ownership_and_write_access.sql` exist on the live
database. `sql/entity_sections.sql` is **not** applied and is no longer needed
(the API does that sweep).

**A login only reaches a dashboard once it has a row in `entity_owners`.** A read-only
audit on 2026-11-02 found exactly one row there (and one platform admin) on the live
database, so the dashboard has hardly been used by real owners. Claims, invites and
`sql/seed_first_owner.sql` are the ways to create more.

Provision logins with `scripts/provision-accounts.mjs` (dry-run first; it needs
the service key in the environment, and writes credentials to
`business-credentials.csv`, which is gitignored and should be treated as secret):

```bash
SUPABASE_SERVICE_KEY=<service_role key> node scripts/provision-accounts.mjs --dry-run --limit=5
```

These scripts hardcode the live project's URL and use the service key directly, so they
**bypass the API**; they are operator tools, not part of the app. Do not paste a service
key anywhere else. `scripts/make-setup-links.mjs` (same key) writes one-time password-setup links to
`setup-links.csv`, also gitignored. `scripts/reconcile-tables.mjs` and
`scripts/build-reconciliation-page.mjs` read `docs/reconciliation/`, which is not
in this repo, so they cannot run as checked in.

Ways in, as built on `main`: a business email and password (`Login.jsx`; for provisioned,
invited and self-signed-up accounts), an invite link (`?token=`, `AcceptInvite.jsx`; the
token wins over an existing session unless an admin pass is being exchanged), a claim, a
new sign-up (`SignUp.jsx`, email and password), or an admin "View as" link. The texted
six-digit code of the default branch is gone from the UI.

**Admin deep link** — `https://<dashboard-host>/?business=<slug>` opens that business's
dashboard with an "Admin view" banner for a signed-in admin (`AuthContext.jsx`); with no
`?business=`, admins land on the searchable picker. The operator console's "View as" adds a
one-time `&pass=` to that link. **On `main` the dashboard exchanges it**: `AuthContext.jsx` posts
`{ pass }` to `POST /api/business-auth/exchange-impersonation`, keeps the returned session in
the session store, scopes the dashboard to the slug and removes `pass` from the URL. A guard
stops React Strict Mode from spending the one-time pass twice. (The default branch does not do
this.) For an admin acting on a business the client adds `slug` to `/api/business/*` calls
only (`apiClient.js`); `/api/store`, `/api/connections` and `/api/nodes` get no slug.

## Automations

The operator builds automations and scripts in `Admin-dashboard-main` and
pushes them here — a "cloud update" for dashboards. The **Automations** tab
(`src/pages/Automations.jsx`) shows what was pushed to this business, at the
version it was given: switch each one on or off, fill in the settings it asks
for, run it now, pull a newer version when one is waiting, copy or replace the webhook
URL that runs it, and open its run history to see what every step did.

Nothing is built on this side. Everything goes through
`/api/business/automations` on gcr-api-clean, scoped by the session like the
rest of `/api/business`. The two tables behind it (`entity_automations`,
`automation_runs`) carry `entity_slug` but are held back from section discovery
by the API, so they never appear as editable sections or in the Add catalog.

## Claims

A business without a login uses **Claim your business** on the sign-in screen.
That searches `GET /api/gcr/entities` and posts to `POST /api/gcr/claim`, which
writes a `business_claims` row with status `new`. It grants nothing on its own —
an admin reviews it through `GET /api/admin/gcr/claims` and
`PATCH /api/admin/gcr/claims/:id`. Those two only list the claims and set their
status and notes; the login and the `entity_owners` row are created by a separate
admin step (for example `POST /api/admin/link-user`). The `admin.html` GCR Claims
panel in cybercheck-login that this flow was written against is not in this
workspace, so its behaviour is not checked here.

## Known gaps

- **Not proven end to end on the live stack**: a real business signing in and editing.
  Deployed state is unverified from here.
- **Hours and tags rows cannot be edited**: `EditableSection.jsx` disables a row with no
  `id`, and the API payload's hours and tags rows carry none.
- **What a business may write** is decided by the API (`lib/businessTables.js` in gcr-api-clean holds the allow-list), not by the Add catalog here.
- **Whole-dashboard refetch after every save**: a save bumps `reloadKey` in `Dashboard.jsx`,
  which re-fetches the full entity payload and re-sweeps the tables (not a browser reload,
  but the whole view reloads).
- **The admin slug is not sent** for `/api/store`, `/api/connections` and `/api/nodes`
  (see Access), so those tabs act on whichever business the session resolves to.
- **Depends on API routes that exist on the API's `main` line**: `routes/owner-modules.js`
  (`/api/owner/modules`), the `apps/` modules, `routes/admin-impersonate.js` and
  `routes/business-ical.js`. Per a file-level comparison they are absent from the integration
  line `codex/nextgent-integration-20261005`; there the Calendar page falls into the generic
  `/api/business/:table` handler and "View as" cannot be minted. The soft fallback covers only
  `/api/owner/modules`.
- **No URL routing**: the app switches views with state (`showStore`, `showGhost`, …) in
  `Dashboard.jsx`, so no tab has its own URL and the back button leaves the app.
- **Platform tab** uses its own Paperclip login (cookie session, separate from the business
  session); the proxy forwards any method and path it is given, with all headers including cookies and `Authorization`, and checks no login of its own, so anyone who can reach the deployed origin can reach that Paperclip backend.
- **Session token in `localStorage`** (`authStore.js`).
- **Operator scripts bypass the API** (see Access), and `docs/everything.html` embeds a
  JWT-format string inside an old `config.js` listing (not inspected; probably the old public
  anon key). The live database has anon write grants revoked, but rotate if in doubt.
  `scripts/make-setup-links.mjs` defaults its redirect to `https://dashboard.gulfcoastradar.com/set-password`,
  a screen this app does not have.
- **`sql/artist_module.sql` is a proposal** ("NEVER RUN" in its own header) and the
  fan-facing artist pages in `gcr-unified` do not read it.
- **`docs/PORT_REVIEW.md` is partly out of date**: it describes a browser Supabase client
  and anon key (none in `src/`) and lists Composio connections and any app concept as
  "not built at all", although `src/pages/AppStore.jsx` and `src/pages/Store.jsx` exist.
- The API line this talks to has open security gaps and two unreconciled git lines; see the
  `gcr-api-clean` README. A merge of its `main` into the integration line with those
  protections is prepared but not published.

`docs/everything.html` is the full record of the original port (architecture write-up,
product spec, reconciliation of the 244-table design against the 563-table database then
live; the live database now has 697 public tables). Open it in a browser; it needs no
server.

## Inside this repo (from the code)

From a code-only review on 2026-11-02 of `main` at f811332. Lint, `check` and build were run on a scratch copy; nothing was run in a browser against the live API (unverified).

**Directory map.** 71 files under `src`, `api`, `scripts` and `sql` plus docs. JSX and JS only, one `src/index.css` (1,074 lines).

| Path | What is in it |
| --- | --- |
| `src/lib/` (23 files) | API client and auth store, discovery engine (`schemaDiscovery`, `entityTables`, `discoverSections`, `sectionCatalog`, `tableMap`, `shapes`), `moduleNav.js` (383 lines) and `modulesApi.js`, `endpoints.js` (136 lines), `AuthContext.jsx` (308 lines, the session and the admin pass exchange), `paperclip.js` |
| `src/pages/` (14) | Login, SignUp, ResetPassword, AcceptInvite, Claim, PublicLinkPage, BusinessPicker, Dashboard, Store, Ghost, Automations, AppStore (Tools), Calendar, Platform |
| `src/apps/` (8 files) | Song Request and Merch Store: `api.js`, `OwnerSettings.jsx`, `GuestPopup.jsx`, `index.js` each |
| `src/components/`, `src/sections/` | TopBar, BottomNav, AddSection, RowEditor, AppStoreView, EmptyModulePanel; the section renderers |
| `api/paperclip/[...path].js` | Vercel edge function, same as on the default branch |
| `scripts/` (5), `sql/` (5), `docs/` | unchanged from the default branch: `check-discovery.mjs` (now 350 lines), the four operator scripts, five SQL files nothing applies, `everything.html`, `PORT_REVIEW.md`, 27 static artist mockups |
| `public/` | `favicon.svg`, `claim-business.html` (redirect for old invite links) |

**Start.** `npm run dev` (Vite, 5173). `vercel.json` has one rewrite, everything to `/index.html`. Env names: `VITE_GCR_API_BASE`, `VITE_LOGIN_DOMAIN` (vestigial), `VITE_REQUEST_TIMEOUT_MS`; the edge function reads `PAPERCLIP_SERVER_URL`; scripts read `SUPABASE_SERVICE_KEY`. Browser storage: `localStorage` for the session (access and refresh token), the table cache and the theme.

**Interfaces.** Single-page app, no router; views are booleans in `Dashboard.jsx`. URL parameters read: `?token=` (invite), `?business=<slug>` and `?pass=` (admin), `?page=link&slug=` (public link page), and the `#access_token=...&type=recovery` hash (password reset). Outbound only; no webhooks, CLI or MCP.

**Against the API.** Path-level comparison with gcr-api-clean `main`: the builders in `endpoints.js`, the `/api/apps/*` calls, `/api/owner/modules`, `/api/business-auth/*` and `/api/public/link-page/:slug` all exist there (the song-request and merch-store routers define the catalog, request/order, queue/products and settings paths this app calls). `GET /api/public/link-page/:slug` is public by design.

**Data.** No database access from `src`. `@supabase/supabase-js` is a devDependency used by the operator scripts, which write to the live project (`mkepugvdlktfsossumox`) directly with a service key (see Access).

**Tests.** No test runner and no CI. `npm run check` (94 passing lines) covers discovery, `tableMap`, the catalog, shape detection and contact masking; it does not cover the pages, sign-in, the pass exchange, module navigation or the apps. `oxlint` 0 errors / 4 warnings; build passes.

**Stubbed or dead.** The Calendar page's Google card is a labelled stub. `nodes.revoke` has no UI. `entity_sections.sql` is unused. The comment at the top of `BottomNav.jsx` ("one tab per discovered section, plus a permanent Add tab") is out of date: there are seven fixed tabs. Everything else flagged in Known gaps is unchanged from the default branch.

## Related repos

`gcr-api-clean` (the API and the only database client), `Admin-dashboard-main` (operator
console), `gcr-unified` (public tourist site), `node-foundation` (home-machine monorepo and
index of the system), and the `nextgent-*` repos.
