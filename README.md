# Business dashboard

> Status: current — last verified against code 2026-11-02 (commit aac903f)

## What it is

**The dashboard a business owner logs into: one business, identified by its
slug.** A static, phone-first React 19 / Vite 8 app (no router, bottom bar instead
of a sidebar, oxlint). Its sections are generated from the database schema via the
API, not hardcoded per business or industry. It is not the operator console; that
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

**This README describes the GitHub default branch, `claude/dashboard-inventory-purposes-m5wtba`
(24 commits, last 2026-10-30, tip aac903f). It is stale: `main` is 23 commits ahead of it
(and 1 behind), and `main` is the line that has been developed since.** `main` carries PRs #5
to #15: module-driven navigation (`src/lib/moduleNav.js`, `GET /api/owner/modules`), email and
password sign-in with forgot/reset password instead of phone codes, the admin "View as" pass
exchange (`POST /api/business-auth/exchange-impersonation`), the Song Request and Merch Store
owner settings and guest popups (`src/apps/`), owner-menu cleanup, a public link page
(`?page=link&slug=`) and a `vercel.json`. The branch
`docs/readme-accuracy-2026-11-02-main`, cut from `origin/main`, has a README that describes
that line. Which of the two Vercel builds for `dashboards-users.vercel.app` is unverified (the
project settings could not be read).

Other branches with unmerged work (commits ahead of the default): `claude/dashboard-folder-structure-wqsm9i` +5,
`claude/new-session-66c2e9` +3 (a Settings page), `claude/modular-booking-platform-wdq0kk` +2,
`claude/admin-dashboard-repo-review-47q2vc` +2, `claude/repo-inventory-audit-5zw4yw` +1,
`codex/paperclip-ghost-ui` +1 (open PR #3, Paperclip controls in My Ghost), `auth/supabase-oauth` +1.
Branch counts drift; run `git ls-remote --heads origin`.

## Run and test

```bash
npm ci
npm run dev      # http://localhost:5173
npm run build    # production build into dist/
npm run check    # scripts/check-discovery.mjs: discovery and table-mapping checks, no network
npm run lint     # oxlint
```

Results on 2026-11-02, Node 22 with `npm ci`, at commit aac903f: `npm run lint` passes (0
errors, 3 warnings), `npm run check` prints "All checks passed", `npm run build` passes.
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
| Sign up and sign in by phone code | `/api/business-auth/*` |
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
| `gcrApi.js` | The gcr-api-clean calls for entity search and claim. |
| `writeEntityData.js` | **Every write goes through here.** It sends no slug: the API takes the business from the session and puts it in the WHERE clause itself. |
| `AuthContext.jsx` | Sign in, session, access. Resolves which business you are from `entity_owners`, admin status from `platform_admins` — both server-side. |
| `config.js` | The API host, the sign-in login domain and the request timeout. No database host or key. |
| `apiClient.js` / `endpoints.js` | The fetch wrapper (session token, typed errors) and every API path, once. |
| `authStore.js` | Where the session lives (`localStorage`), token renewal, and the slug an admin is acting on. |
| `shapes.js` | Works out from a table's columns and rows whether it is a progress bar, a price list or a fan-submitted inbox, and masks other people's contact details. |
| `appStore.js` / `automations.js` / `calendar.js` / `paperclip.js` / `industries.js` / `useTheme.js` | Calls and helpers for Tools, Automations, the Calendar, the Paperclip proxy, the industry list and the light/dark/auto theme. |

**Screens — `src/pages/`** — `Login`, `SignUp`, `AcceptInvite`, `Claim`, `Dashboard`, `BusinessPicker` (admin only), `Store`, `Ghost` (My Ghost), `Automations`, `AppStore` (Tools, the Composio connections), `Calendar` (iCal import and export), `Platform` (Paperclip login and store, through `api/paperclip`).

**Layout — `src/components/`** — `TopBar`, `BottomNav` (one tab per discovered
section plus seven fixed tabs: Calendar, Tools, Platform, Store, My Ghost, Automations and Add; mobile-first, no sidebar), `MainContent`,
`AddSection` (the catalog), `RowEditor` (builds a form from a table's columns),
`AppStoreView` (the Tools list).

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

Ways in, as built: a texted six-digit code (`Login.jsx`), a business login and
password for provisioned or invited accounts, an invite link (`?token=`,
`AcceptInvite.jsx`), a claim, or a new sign-up (`SignUp.jsx`: phone, code,
business name, industry; the listing stays hidden until reviewed).

**Admin deep link** — `https://<dashboard-host>/?business=<slug>` opens that business's
dashboard with an "Admin view" banner for a signed-in admin (`AuthContext.jsx`); with no
`?business=`, admins land on the searchable picker. The operator console's newer "View as"
adds a one-time `&pass=` to that link. **On this (default) branch the dashboard never reads
`pass` and never calls `/api/business-auth/exchange-impersonation`, so the pass flow does not
sign anyone in here. That is true of this branch only: `main` reads `pass`, exchanges it and
strips it from the URL (`src/lib/AuthContext.jsx`).** For an admin acting on a business the client adds `slug` to
`/api/business/*` calls only (`apiClient.js`); `/api/store`, `/api/connections` and
`/api/nodes` get no slug.

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
- **Admin "View as" pass is not exchanged on this branch (it is on `main`)** and the admin slug is not sent for
  `/api/store`, `/api/connections` and `/api/nodes` (see Access).
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

From a code-only review on 2026-11-02 of this branch's code (default-branch tip aac903f). Lint, `check` and build were run on a scratch copy; nothing was run in a browser against the live API (unverified). **The default branch is not the newest line: `main` is 23 commits ahead (see Branches). Everything below describes the default branch.**

**Directory map.** 58 `src` files (all reachable from `main.jsx`, none dead), JSX 36 files / 4.4k lines, JS 22 / 2.0k, one 1,065-line `src/index.css`.

| Path | What is in it |
| --- | --- |
| `src/lib/` (21 files) | API client and auth store, the discovery engine (`schemaDiscovery`, `entityTables`, `discoverSections`, `sectionCatalog`, `tableMap` with about 59 renames, `shapes`), `endpoints.js` (49 path builders, 47 used), `paperclip.js` |
| `src/pages/` (12) | Login, SignUp, Claim, AcceptInvite, BusinessPicker, Dashboard, Store, Ghost, Automations, AppStore (Tools), Calendar, Platform |
| `src/components/`, `src/sections/` | TopBar, BottomNav, AddSection, RowEditor, AppStoreView; 13 section renderers (Hours, Photos, Menu, HappyHour, Events, Specials, Reviews, Faqs, Policies, Offerings, PriceList, Progress, Generic) plus `EditableSection` |
| `api/paperclip/[...path].js` | Vercel edge function |
| `scripts/` (5) | `check-discovery.mjs` (offline), `provision-accounts.mjs`, `make-setup-links.mjs`, `reconcile-tables.mjs`, `build-reconciliation-page.mjs` |
| `sql/` (5) | `artist_module.sql` ("NEVER RUN" in its header), `close_anon_write_access.sql`, `ownership_and_write_access.sql`, `seed_first_owner.sql`, `entity_sections.sql`; nothing in this repo applies them |
| `docs/` (32 files) | `everything.html`, `PORT_REVIEW.md`, 3 screenshots, `artist-mockups/` (27 static HTML design mockups for fan pages that live in `gcr-unified`; nothing in `src` reads them) |

**Start.** `npm run dev` (Vite, port 5173); the dev server proxies only `/api/paperclip` to `PAPERCLIP_DEV_SERVER`. No `vercel.json`, no CI, no Dockerfile on this branch. Env names: `VITE_GCR_API_BASE`, `VITE_LOGIN_DOMAIN`, `VITE_REQUEST_TIMEOUT_MS` (all in `src/lib/config.js`), `PAPERCLIP_SERVER_URL` (edge function), `SUPABASE_SERVICE_KEY` (scripts only). `VITE_LOGIN_DOMAIN` is vestigial: it is exported and re-exported but nothing builds an address from it. Browser storage: `localStorage` `gcr_business_session_v1` (access and refresh token), `gcr_entity_tables_v1`, `gcr_dashboard_theme`; `sessionStorage` `gcr_tables_<slug>` (5 minutes).

**Interfaces.** A single-page app with no router: the seven views (`showApps`, `showGhost`, `showStore`, `showPlatform`, `showAutomations`, `showCalendar`, `adding`) are booleans in `Dashboard.jsx`. URL parameters read: `?token=` (invite) and `?business=<slug>` (admin). The bottom bar scrolls horizontally, so on a phone the seven fixed tabs can be pushed off screen by a business with many sections. No webhooks, CLI or MCP.

**Against the API.** On gcr-api-clean `main` all 49 builders resolve at path level except `store.status` (a `/:id/<verb>` template whose verbs exist). On the integration API line the Calendar page is broken: `routes/business-ical.js` does not exist there, so `/api/business/ical*` falls into the generic `/api/business/:table` handler. Requests carry no slug, except that `?slug=` is added on `/api/business/*` for an admin acting as a business or an owner with more than one linked unit; the server checks it against `entity_owners` / `platform_admins`.

**Data.** No database access from `src`: no Supabase SDK in the bundle. `@supabase/supabase-js` is a devDependency used only by `scripts/`, which talk to the live project (`mkepugvdlktfsossumox`) directly with a service key. Those scripts break the rule that only the API touches the database; they are operator tools, gated by a manual `--dry-run`.

**Tests.** No test runner and no CI. `npm run check` runs 69 offline assertions on discovery, `tableMap`, the catalog, shape detection and contact masking; it covers no page, no auth and no API client. On the scratch copy: `check` passes, `oxlint` 0 errors / 3 warnings, `vite build` passes (348 KB `dist`, JS 297 KB).

**Stubbed or dead.** Only the Calendar page's Google Calendar card is a labelled stub. `nodes.revoke` has an endpoint builder and no UI. `sql/entity_sections.sql` is unused. `RowEditor` has no required-field validation and no controls for json, array, image or relation columns. Menu, drink and happy-hour items are nested under their parent sections, so as far as the code shows an existing menu item cannot be edited or deleted here (Add can create one). `AppStoreView.jsx`/`.css` and the Paperclip edge function are copies of the `Admin-dashboard-main` files.

## Related repos

`gcr-api-clean` (the API and the only database client), `Admin-dashboard-main` (operator
console), `gcr-unified` (public tourist site), `node-foundation` (home-machine monorepo and
index of the system), and the `nextgent-*` repos.
