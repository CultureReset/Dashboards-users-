# SDK app renderer

`src/sdkapp/` draws any App SDK app (gcr-api-clean `docs/APP-SDK.md`) from what
the API says about it. There is no per-app code: a new folder under `apps/` in
the API repo appears here, as a tile and a working screen, with no dashboard change.

## How a new app appears with no dashboard code

1. The app ships in gcr-api-clean (`apps/<id>/manifest.json` + `handlers.js`). The API lists it in the Store.
2. The owner installs it. `GET /api/store` then returns its row (`key` = the app id, `kind: 'app'`, `installed`).
3. `front/tiles.js` `tileFromManifest()` makes its tile and targets `{ view: 'sdk', appKey: item.key }`
   (a switched-off app, a row without a key, or a `kind` other than `app` still opens the Store).
4. `Dashboard.jsx` mounts `<SdkApp appKey=...>` for that target. `SdkApp` calls `GET /api/apps/<id>` (the
   descriptor) and draws what it describes. If the API answers 404 (the item is not an SDK app) it renders the
   Store screen, exactly as before.

`AppFrame.jsx` and `AppHome.jsx` are untouched: the frame already supplies the back button and title, and the
renderer is mounted in the Dashboard's view switch beside the other screens.

## What is drawn

In this order, each only when the app declares it: a row of jump chips, one section per resource, settings,
actions, the public link, and "What this app can do".

| Surface | Behaviour |
| --- | --- |
| Resource list | Cards on a phone, a table from 720px. Title field first. Table shows the title plus the three most compact columns (numbers, choices, yes/no, dates before free text); the rest are in Edit and on the cards. Search (text fields), sort by any column or "Newest first", filters for select and yes/no fields, empty state, Previous/Next with "Showing 1-50 of 140" (pages of 50). |
| Add / Edit | A sheet generated from the field list. Edit sends only what changed (a cleared field is sent as `null`); Add leaves empty optional fields out so the API's declared default applies. Unsaved changes ask before closing. |
| Delete | Confirm sheet naming the entry; "can't be undone". |
| Settings | Form from `settings.schema`, prefilled from `settings.values`, saved with `PATCH /settings` with only the changed keys. Server `errors` land under their fields. |
| Actions | A button per action. `handler` and `read` run (`POST /actions/<id>`); an action with `input` opens a form first. `create` opens the resource's Add form. `update` has no button (it is Edit on each row). Result in a toast and an aria-live panel. |
| Public link | `<API origin><public.path>` with Copy, Open, a QR code drawn by `qr.js` (no dependency, byte mode, level M, versions 1-10, longest possible link fits) and the two endpoints for a website. |
| Permissions | Reads / Writes / Sends / what customers can do, in sentences, plus each permission the app asked for with "Allowed" or "Not allowed" from `permissions.granted`. |

### Field types

`text`, `textarea`, `select` (options as strings or `{ value, label }`), `email`, `phone`, `url`, `number`,
`integer`, `money`, `boolean` (switch), `date`, `timestamp` (date-time picker, sent as ISO), `json` (code box).
Rules: `required`, `min`/`max` (numbers), `max_length` (with a counter), select options, email/URL/phone
format, real calendar dates, valid JSON. Messages are plain words, shown under the field, tied to it with
`aria-describedby`/`aria-invalid`, summarised in an aria-live region, and focus goes to the first one.
Unknown types are drawn as text.

Also honoured when present although the API schema does not define them today: `type: 'image'` (or a `url`
field whose key ends in `image`, `photo`, `logo`, `avatar`, `thumbnail`) shows a preview; `pattern` /
`pattern_message` and `min_length`.

### States

| What happened | What the owner sees |
| --- | --- |
| `503 code: not_configured` | "Not switched on yet": the app needs a one-time setup on the platform; nothing is wrong with their business. No SQL file names or database words. Try again. |
| Offline (no response) | "You're offline" with Try again on the whole app; a banner when the browser goes offline; a failed save keeps what was typed and says so. Recovers on its own when the connection returns. |
| `403` | "Not included in your plan" with an Open the Store button. |
| `409 code: not_installed`, or `installed: null` | "<App> was removed", data is kept, Open the Store. Triggered from any call mid-session. |
| `401` | `apiClient` signs the owner out as it does everywhere. |
| `422` | Per-field messages under the fields (the API's fragments, such as "must be a whole number.", are rewritten as sentences). |

## Confirmed from code vs assumed

Confirmed means read in gcr-api-clean `origin/feat/app-sdk` (`lib/appSdk/router.js`, `runtime.js`,
`records.js`, `manifest.js`, `install.js`, `routes/store.js`) at `dde18c1`. Nothing was run against a live API.

Confirmed:
- Paths and shapes: `GET /api/apps`, `GET /api/apps/:id` (descriptor), `PATCH .../settings`, resource list/create/patch/delete, `POST .../actions/:action`; `{ rows, total, limit, offset }`; `{ row }`; `{ deleted }`; `{ action, result }`; `422 { error, errors }`; `409 not_installed`; `503 not_configured`.
- The descriptor carries the whole manifest in drawn form (fields with every rule, settings schema and values, actions with inputs, permissions requested/granted, `public.path`), so no raw manifest is needed. `scripts/fixtures/sdk/descriptor.mjs` copies that builder.
- The owner Store list (`GET /api/store`, `ownerCatalog`) does NOT include the manifest; it has `key`, `kind`, `installed`. So the existing `manifestOf(item)` in `tiles.js` finds nothing today and the tile name/icon come from the Store row. The SDK tile therefore keys off `item.key`, not a manifest.
- `ownerRequired` accepts `?slug=` for admins, so `actingScope.js` now attaches it to the SDK owner routes (`/api/apps`, `/api/apps/<id>`, and `settings`, `resources`, `actions` below it). It is deliberately not a `/api/apps` prefix: the older route apps use `/api/apps/<app>/<business slug>`.
- Public link = `<API origin><public.path>`; the install id names the business.

Assumed:
- Which items are SDK apps: tried for every installed `kind: 'app'` (or unknown-kind) item with a key; a 404 means not SDK.
- The descriptor's actions do not name their `resource`; for `create`/`update` it is inferred by matching the action's input fields to a resource's fields.
- "Sends messages": the API does not flag it per action. A write `handler` in an app that requested `messages:send` (and, when known, was granted it) is treated as possibly sending. "Destructive" is a word match on id/label/summary (delete, remove, clear, reset, cancel, wipe, ...). Both only add words and a red button; every write is confirmed anyway.
- Sorting, filtering and search run on the loaded page: the API only pages (`limit`/`offset`) and filters nothing. The list says so when there is more than one page.
- Money is shown in US dollars.
- Phone numbers need 7-15 digits in the form; the API accepts any text, so this is stricter than the server.
- The public link opens the API's JSON endpoint. No customer-facing page that draws it exists in either repo yet.

## Checks and screenshots

`npm run check` runs `scripts/check-sdkapp.mjs`: every field type with good and bad values; forms generated from the real feedback manifest and three synthetic apps (all types, no resources, actions only), each also rendered and checked for bound labels and tied errors; the settings round trip; the confirm rule; list sort/filter/paging; permission wording; the public link and a structural plus cross-encoder QR check; error classification; acting-slug scope; tile wiring.

`scripts/shoot-sdkapp.mjs` (needs playwright and `vite preview`) drives the built app against a stub API and writes `sdkapp-*.png` at 390x844 and 1280x860.

## Not done

- No customer-facing public page, and no "Run" history; action results are shown once, not stored.
- No server-side sort/filter (needs API support), no bulk actions, no row detail view beyond Edit.
- No file/image upload (the SDK has none); image URLs only.
- Version bumps and the uninstall/enable buttons stay in the Store.
- Not run against the live API or a real database; the 503 path is exercised with a stub.
- Focus handling, labels and live regions are tested by markup, not with a screen reader.
