# Business Dashboard

The dashboard a business owner signs in to on Gulf Coast Radar and CyberCheck. One login, one business. It is built phone-first, with a bottom bar and no sidebar, and it is live at `https://dashboards-users.vercel.app`.

The dashboard has no fixed list of features. It asks the API which tables exist, loads the rows that belong to the signed-in business, and turns every table that has data into a section. A restaurant gets Menu, Hours and Happy Hour. A fishing charter gets Trips, Species, Meeting Points and Weather Rules. Same code, different data. Add a table to the database and it shows up for every business that has rows in it, with no deploy.

The operator console, where you see every business at once, is a separate app: [Admin-dashboard-main](https://github.com/CultureReset/Admin-dashboard-main). Both use the same backend, [gcr-api-clean](https://github.com/CultureReset/gcr-api-clean).

| Store | My Ghost |
| --- | --- |
| ![Store: an update is ready, another app is available](docs/images/store.png) | ![My Ghost: the business's box, online, with a command bar](docs/images/my-ghost.png) |

## Features

- **Sections from data.** Every table with an `entity_slug` column and rows for this business becomes an editable section. Edit forms are built from the table's columns.
- **Add.** A catalog of every table the business could use but isn't yet, grouped and searchable. Pick one, fill in the form, and it becomes a live section.
- **Setup guide.** A checklist built from the business's own data: calendars, tools and installed apps, with recommended sections for its industry (`src/lib/setupGuide.js`).
- **Modules.** The tabs come from the modules enabled for the business (`GET /api/owner/modules`) merged with every table that has data, so an enabled module with no rows still gets a tab and an empty-state panel.
- **Calendar.** A month view of availability and bookings where the owner can close dates and set capacity, plus iCal import per unit, sync on demand, and this business's own iCal export URL.
- **Song Request and Merch Store.** Owner settings for the two built-in apps (`src/apps/`), and their guest popups on the business's public link page.
- **Store.** Apps the operator made available (free, in the plan, or granted): install, switch off, configure, remove, and pull updates. An update that asks for more access is never applied without the owner's yes.
- **My Ghost.** Enrol the business's on-site box, see whether it is online, and send it requests through the relay. The box pulls requests over its own outbound connection, so nothing needs to reach into the business's network.
- **Automations.** What the operator pushed to this business, at the version it was given: switch on or off, fill in settings, run now, update, copy the webhook URL, and read run history.
- **Tools.** Connect third-party accounts through `/api/connections`.
- **Platform.** A Paperclip store tab. Calls go to this site's `/api/paperclip` and are forwarded to the Paperclip server.

## Getting started

```bash
git clone https://github.com/CultureReset/Dashboards-users-.git
cd Dashboards-users-
npm install
npm run dev        # http://localhost:5173
```

A plain checkout points at the live API. To use a local gcr-api-clean, create `.env.local`:

```bash
VITE_GCR_API_BASE=http://localhost:3000
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server. Proxies `/api/paperclip` to `PAPERCLIP_DEV_SERVER` (default `http://localhost:3100`). |
| `npm run build` | Production build into `dist/`. |
| `npm run preview` | Serve the build locally. |
| `npm run check` | Section discovery, table mapping and contact-masking checks. No network needed. |
| `node scripts/test-setup.mjs` | Setup-guide checks. |
| `node scripts/test-paperclip-proxy.mjs` | Paperclip proxy checks. |
| `npm run lint` | oxlint. |

```console
$ npm run check
  ok    somebody else's phone is masked
  ok    an invented contact column is caught
  ok    a plain phone column on a list row is masked
  ok    the business's own phone stays readable
  ok    a non-contact column is untouched

All checks passed
```

## Configuration

All values are optional. Defaults live in `src/lib/config.js`.

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_GCR_API_BASE` | `https://gcr-api-clean.vercel.app` | The only API the browser calls. |
| `VITE_LOGIN_DOMAIN` | `biz.gulfcoastradar.com` | A business's login maps to `<slug>@<domain>`. Must match `scripts/provision-accounts.mjs --domain` and the API's login domain. |
| `VITE_REQUEST_TIMEOUT_MS` | `30000` | Abandon an API call after this long. |
| `PAPERCLIP_SERVER_URL` | none | Server-side, on Vercel. Where `api/paperclip.js` forwards `/api/paperclip/*`. Without it the proxy returns 503. |
| `PAPERCLIP_DEV_SERVER` | `http://localhost:3100` | Local dev proxy target for the same path. |

The app holds no database key and never talks to the database. Every read and write goes through gcr-api-clean, which decides which business you are from your session, never from anything the browser sends. Never put a service key in a `VITE_` variable: those are compiled into the browser bundle.

## How it works

### Where the data comes from

| What | Endpoint |
| --- | --- |
| Who you are, what you own, admin or not | `GET /api/business/me` |
| Tables that can be sections, and their columns | `GET /api/business/schema` |
| Every section with rows, in one call | `GET /api/business/sections` |
| Create, update or delete a row | `POST`, `PATCH`, `DELETE /api/business/:table[/:id]` |
| iCal overview, feeds, export URL | `/api/business/ical`, `/ical/feed-url`, `/ical/regenerate`, `/ical/external[/:id[/sync-now]]` |
| Email and password sign-in, refresh, sign-out, password reset | `/api/business-auth/password`, `/refresh`, `/signout`, `/forgot-password`, `/reset-password` |
| Self-serve sign-up | `POST /api/auth/business-signup`, with `/api/business-auth/similar` to warn about duplicates |
| Admin "Open dashboard" pass | `/api/business-auth/exchange-impersonation` |
| Enabled modules | `GET /api/owner/modules` |
| Owner month calendar | `/api/business/calendar`, `/calendar/block[/:id]`, `/calendar/capacity` |
| Public listing payload | `GET /api/gcr/entity/:slug` |
| Industry list | `GET /api/business/industries` |
| Invites | `GET /api/auth/invite/:token`, `POST /api/auth/accept-invite` |
| Claim a business | `GET /api/gcr/entities?search=`, `POST /api/gcr/claim` |
| Tools | `/api/connections` |
| Store | `/api/store` (`:id/install`, `:id/update`, `:id/disable`, `:id/enable`, `PATCH :id/config`, `DELETE`) |
| My Ghost | `/api/nodes` |
| Automations | `/api/business/automations` |

Every path is defined once in `src/lib/endpoints.js`.

### Writes never send a slug

All writes go through `src/lib/writeEntityData.js`, which sends the table and the row but no business id. The API takes the business from the session and puts it in the `WHERE` clause itself. What a business may write is decided by the API's allow-list, not by this app.

### Renamed tables

The API reshapes some tables in the listing payload: `entity_hours` arrives as `hours`, `entity_offer_fee` as `fees`. `src/lib/tableMap.js` maps those names back so the section can be edited. Anything not in the map is treated as a real table name, so a new table works untouched.

### Decisions made from the shape of the data

`src/lib/shapes.js` decides how to render a table by looking at its columns and rows, not its name:

| Decision | Rule |
| --- | --- |
| Which sections exist | Tables with rows for this business |
| What you can add | Every slug table you aren't using yet |
| Progress bar | The row has a raised and target numeric pair |
| Price list | Rows have a kind, a label and an amount |
| Held back from Add | Rows carry someone else's identity, or the table collects submissions |
| Contact masking | The field name matches a contact convention |

A `merch_crowdfund` table invented tomorrow gets a progress bar. A `sponsor_tiers` table gets the grouped price layout. A `wish_wall` table with a `patron_phone` column is treated as fan-submitted: it shows as a section once it has rows, is never offered under Add, and masks the phone numbers. `npm run check` feeds the detectors invented tables like these and asserts the result.

Internal tables (indexes, access control, audit and analytics logs, message tables, backups) are hidden everywhere by `src/lib/sectionCatalog.js`.

## Signing in

A login reaches a dashboard only when the API links it to a business in `entity_owners`. Admins are listed in `platform_admins`. Sign-in is by email and password (`Login.jsx`), with a forgot-password email whose link returns to `ResetPassword.jsx`. Ways to get an account:

- **Sign up** (`SignUp.jsx`): business name, industry, email and password. The API creates the listing, the login and the ownership link in one call, and warns first if similar listings already exist. A retry after a partial failure only signs in; it never registers twice.
- **Invite link** with `?token=` (`AcceptInvite.jsx`), sent by an admin.
- **Claim** an existing listing from the sign-in screen. An admin reviews the claim before access is granted.
- **Provisioned accounts**, created in bulk by the scripts below.

Admins can open any business with `?business=<slug>`, which shows an "Admin view" banner; with no `?business=`, an admin lands on a searchable picker. The operator console's "Open dashboard" button sends `?pass=…&business=<slug>`, and the dashboard exchanges that one-time pass for a session.

Each business also has a public link-style page at `?page=link&slug=<slug>`. It needs no sign-in, and its buttons come from the business's installed apps.

### Provisioning logins

The scripts read the service key from the shell, never from a `VITE_` variable. Always dry-run first.

```bash
SUPABASE_SERVICE_KEY=... node scripts/provision-accounts.mjs --dry-run --limit=5
SUPABASE_SERVICE_KEY=... node scripts/make-setup-links.mjs
```

`provision-accounts.mjs` writes `business-credentials.csv` and `make-setup-links.mjs` writes `setup-links.csv`. Both are gitignored. Treat them as secrets.

## Artist module

Artists are businesses like any other, with the same discovery and editor. `sql/artist_module.sql` proposes the pricing an artist controls (price per song, custom-song price, shoutout and tip tiers, crowdfund targets, tip links, requests open), with `artist_price_tiers` as one table behind every paid button. The file is marked as a proposal and has not been applied. `src/lib/artistModule.js` only supplies friendlier labels and icons; delete it and the artist dashboard still works. The fan-facing artist pages live in [gcr-unified](https://github.com/CultureReset/gcr-unified).

## Project layout

```
src/
  lib/          Engine: discovery, catalog, shapes, module nav, table map, API client,
                endpoints, auth, calendar, setup guide, paperclip
  pages/        Login, ResetPassword, SignUp, AcceptInvite, Claim, Dashboard, BusinessPicker,
                Setup, Calendar, Store, Ghost, Automations, AppStore (Tools), Platform, PublicLinkPage
  components/   TopBar, BottomNav, MainContent, AddSection, RowEditor, AvailabilityCalendar,
                EmptyModulePanel, AppStoreView
  sections/     GenericSection renders any table; registry.jsx maps purpose-built renderers
  apps/         song-request and merch-store: owner settings and guest popups
api/paperclip.js  Vercel edge function that forwards /api/paperclip/* to PAPERCLIP_SERVER_URL
scripts/        check-discovery.mjs, test-setup.mjs, test-paperclip*.mjs, provision-accounts.mjs,
                make-setup-links.mjs, reconciliation tools
sql/            Ownership and write-access functions, artist module proposal, first-owner seed
docs/           PORT_REVIEW.md, everything.html (architecture and spec), screenshots
```

## Deployment

Build with `npm run build` and serve `dist/`. On Vercel, `vercel.json` rewrites `/api/paperclip/*` to the `api/paperclip.js` edge function and every other non-asset path to `index.html`. Set `PAPERCLIP_SERVER_URL` in the project for the Platform tab.

## Further reading

- `docs/everything.html`: architecture, product spec and the table reconciliation. Open it in a browser; it needs no server.
- `docs/PORT_REVIEW.md`: notes from the original port. Parts predate the move to gcr-api-clean.
