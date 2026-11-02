# The front layer: the owner's app home

The first thing a business sees is a grid of apps, like a phone's home screen,
not a dashboard of tables. Each module is an app. Apps are industry-agnostic:
Merch Store and Song Request are the same app for a restaurant, an artist or a
fishing charter. The business's own data (hours, menu, photos, ...) and Setup
are tiles in the same grid. Tapping a tile opens that app full screen with a
Back button; the last tile, **Add app**, opens the Store.

Code lives in `src/front/`. The only edits outside it are small and additive:
`Dashboard.jsx` (wiring), `lib/dashboardView.js` (the `home` and `app` views and
`landingView`), `components/BottomNav.jsx` (an optional "Apps" button), and the
checks.

## The look is a placeholder

`theme.css` is a neutral, plain look so the layer works and can be judged. It is
**not** modelled on a9ent.co or myset.vip. Neither site could be viewed when
this was built, and nothing here claims to match them. The real look is yet to
be chosen.

## How to restyle: `theme.css` and `Tile.jsx`, nothing else

1. **Tokens** at the top of `src/front/theme.css`: every colour, radius, space,
   tile size and type step is an `--fl-*` variable. Light is the base; dark
   follows `prefers-color-scheme`, and an explicit `data-theme` (the Appearance
   switch) wins both ways, as in `index.css`. Changing values restyles everything.
2. **Rules** below the tokens use tokens only (no colour or size literals). To
   change the *shape* of a tile (icon above name, icon beside name, a wide
   card), edit `Tile.jsx` and the `.fl-tile*` rules next to it.
3. `Tile.jsx` is the only tile markup. Apps, sections, Setup and "Add app" all
   render through it. `AppFrame.jsx` is the chrome around an opened app (Back
   plus title); its rules are the `.fl-frame*` block in the same CSS file.

Kept regardless of look: 44px minimum targets (`--fl-target`), safe-area
insets, visible focus rings, `aria-label`s that read name, status and
attention, and `prefers-reduced-motion` (no wiggle, no press animation).
If the app's top bar height changes, update `--fl-topbar-h` so the frame header
sticks beneath it.

## Where tiles come from

`tiles.js` (`buildTiles`) is pure data and is tested without a browser. It
invents nothing. Sources, in default order:

| Kind | Source | Opens |
| --- | --- | --- |
| `app` | an installed Store app that has a screen here (Merch Store, Song Request), matched by key, never by industry | its screen |
| `sdk` | any other installed Store app (`GET /api/store`) | its Store entry (see below) |
| `data` | a discovered data section | the section |
| `core` | Setup, Calendar, Tools, Automations, My Ghost (Platform exists but starts hidden) | that screen |
| `add` | always last, not reorderable | the Store |

Rules worth knowing:

- An app is **one** tile. The table behind it (`products`, `song_requests`) is
  absorbed into the app tile instead of showing up again as a section.
- A table outside `owner_visible_tables`, or platform machinery (`ai_*`,
  `entity_owners`, ...), never gets a tile, even if something hands `buildTiles`
  a section for it.
- Status is one line and only what is cheap and true: row counts from data
  already loaded, "N new" for song requests with `status: 'new'`, "Not set up"
  for an installed section with no rows, "Update ready", "Switched off". Core
  tiles show a short static hint. A badge means attention.
- Nothing names a business or an industry.

### How an SDK app gets a tile

From its manifest. `tileFromManifest(manifest, storeItem)` reads:

- `name` (falls back to `dashboard.label`, then the Store row's name)
- `icon` (an emoji, or an `https:` / `data:image` URL; falls back to the Store row)
- `surfaces` (an array of names, an array of `{ type }`, or an object keyed by
  surface; kept on the tile for the frame)

The manifest is read from `item.manifest`, `item.installed.manifest` or
`item.available.manifest`. Install it from the Store and the tile appears on
the next load; remove it and it goes. Those field names are the contract in
`docs/everything.html` section 2.3 and are **not yet confirmed against the live
`/api/store` response**.

## Layout: order and hiding

`layout.js`. Edit mode (the **Edit** button, or long-press a tile) shows
earlier/later buttons and a hide button on each tile, plus a Hidden shelf to
bring tiles back and a Reset. Saved in `localStorage` under
`nextgent_home_layout_v1:<slug>`: per browser **and per business**, so an admin
using "View as" never rearranges one business by editing another. Every storage
call is in try/catch; with storage blocked the layout still works for the
session. A saved layout can only order or hide tiles that exist; it never adds
one. New tiles land at the end.

## Landing and navigation

- `view` gains `home` and `app`. Dashboard keeps *which* app is open in
  `appTarget` and passes that app's own view to the existing screen switch, so
  every existing page and section renders unchanged inside `AppFrame`.
- An owner lands on `home` when the business has at least one installed app or
  one section (`landingView`), decided before first paint and only until they
  navigate. A business with neither still lands on Setup, which stays a tile.
  Other views keep the bottom bar, which has a new **Apps** button back.
- Admin "View as" is unchanged: the acting slug still comes from
  `actingScope.js` / `authStore`, so the Store call carries it; the launcher
  never names a business.

## Checks

`npm run check` runs `scripts/check-discovery.mjs` and `scripts/check-front.mjs`
(tile building for an empty business, a restaurant with Merch Store, an artist
with Merch Store and Song Request, a charter with twelve sections; hidden
tables; manifests; ordering and hiding persisting, per business, with broken
storage; the view reducer).

## Not done

- **SDK app surfaces are not mounted.** An SDK tile opens its Store entry, not
  the app's own owner screen. `surfaces` is recorded for when a host exists.
- **Reordering is buttons, not drag.** Accessible and reliable, but not the
  phone-native drag. Long-press only enters Edit mode, and was exercised with
  automation, not on a real touch device.
- **Layout is not synced** across devices or people (browser storage only).
- **Browser Back / swipe-back does not close an app** (no router). The in-app
  Back button does.
- **Live status is limited** to counts from data already loaded. No per-tile
  fetches; Calendar, Tools and My Ghost show a static hint.
- **Store item shape** (`key`, `manifest`) is assumed, as above. Without a
  matching key, an installed built-in app falls back to the owner-modules stub.
- **Icons are emoji** (like the rest of the dashboard); no icon set.
- **Not reviewed with a screen reader**; labels and focus handling are in place.
- **The look is a placeholder** (see above).
- Platform is a tile that starts hidden rather than part of the default grid.
