# Ghost UI/UX reference screens

The clickable prototype of the whole Ghost platform — 176 self-contained HTML
screens, filed by which part of the architecture they belong to.

Open `index.html` in a browser, or jump straight to
`screens/00-system/index.html` (the screen directory) or
`screens/01-account/welcome.html` (the owner journey, start to finish).

These are **reference screens, not source code.** Nothing here is built, bundled
or imported by the app. `src/` is untouched by this folder.

---

## What this is a prototype *of*

Ghost is not one application. It is one identity — account → workspace →
business — with **six independently installable ecosystems** hanging off it,
each with its own catalog, its own install records, its own permissions and its
own runtime. Shared identity does not mean shared implementation.

| Ecosystem | What it is | Catalog | Per-workspace install |
|---|---|---|---|
| **Data Modules** | Structured business facts that actually exist | `module_catalog` | `entity_modules` → display preferences |
| **Ghost Apps** | Independent software products | `app_catalog` / `app_versions` | `workspace_app_installs` |
| **Connections** | Outside SaaS reached by API/OAuth/MCP | `platform_connections` | `entity_connections` |
| **Device Apps** | Third-party Android apps Ghost operates | `device_app_catalog` | `workspace_device_apps` |
| **Plugins** | Reusable capabilities mounted into a host | `plugin_catalog` | `workspace_plugin_installs` |
| **Automations / Scripts** | Workflows that compose capabilities | `automation_catalog` | `workspace_automation_installs` |

The rule these screens exist to make visible:

> A Data Module is data. An App is a product. A Connection is somebody else's
> system. A Device App is an execution target. A Plugin is a capability. An
> Automation is a workflow. They can cooperate. They are never the same thing.

Which is why a table having an `entity_slug` column is **not** enough to make it
a business-data section — `song_requests` is scoped by slug and is still app-
private. Discovery needs a classification (`DATA_MODULE`, `APP_PRIVATE`,
`CUSTOMER_SUBMISSION`, `PLATFORM_INTERNAL`, …), not just a column check.

---

## The folders

Numbered in the order a real workspace moves through them.

| Folder | Screens | Covers | Implemented in |
|---|---|---|---|
| `00-system` | 7 | Journey map, ecosystem map, install flow, capability flow, workspace manifest, screen directory | — (explainers) |
| `01-account` | 9 | Account creation, phone/passkey verification, privacy, create or join a workspace | this repo + auth |
| `02-setup` | 19 | Claim a business, verify ownership, industry, basics, hours, media, then per-ecosystem recommendations and first published page | this repo |
| `03-owner-dashboard` | 15 | Home, business switcher, Business Data, data module library and detail, conflicts, and the home screen of each ecosystem | **this repo** |
| `04-ghost-apps` | 16 | App store, category, and the full install arc for Song Request, QR Menu, Authentic Reviews, Availability | app registry + AppHost |
| `05-connections` | 11 | Connections store, categories, Gmail OAuth arc, Composio vs native providers, health, capabilities, removal | connection registry |
| `06-device-apps` | 16 | Device app store, the Facebook Android install arc, devices, cloud Android, live viewer, home node, AppMaps, repair pipeline | device service + executors |
| `07-plugins` | 8 | Plugin store, QR generator bind/permissions/ready, AI summary, PDF export, bindings | plugin registry |
| `08-automations` | 15 | Automation store, cancellation-waitlist install arc, the trigger→condition→action→approval→verify builder, runs, script packages | automation registry + runtime |
| `09-public-surfaces` | 11 | Surface builder: layout, items, theme, mobile/desktop preview, publish, analytics | surface composer |
| `10-settings` | 13 | Team, invites, permissions, approval inbox, security, sessions, billing, export, audit log | this repo |
| `11-customer-facing` | 10 | What the customer sees: business home, link page, menu, availability, events, reviews, song request, loyalty | `gcr-unified` |
| `12-admin-console` | 16 | Operator views over businesses, data modules, schema registry, apps, plugins, connections, device apps, automations, permissions, surfaces, devices, operations | `Admin-dashboard-main` |
| `13-developer` | 10 | Developer portal, SDK, permissions, schema, surface, test, package, publish, API explorer | developer portal |

The last three columns matter: **`12-admin-console` and `11-customer-facing` are
not this repo's job to build.** They live here because the prototype is one
connected clickable set and splitting it across four repositories would destroy
the only thing it is good for. When those screens get implemented, they get
implemented in `Admin-dashboard-main` and `gcr-unified`.

## `03-owner-dashboard` is the target for this repo

Today `src/` implements one ecosystem — Data Modules — very well: it reads the
live schema, sweeps every `entity_slug` table for one business, and turns
whatever has rows into a section. No hardcoded features, no industry presets.

`screens/03-owner-dashboard/` shows what that grows into: the same dynamic
Business Data tab, plus Apps, Connections, Device Apps, Plugins, Automations,
Activity and Settings as **sibling tabs fed by install records** — not by
scanning tables.

| Tab | Appears because | Not because |
|---|---|---|
| Business Data section | real rows exist for this slug | a module was picked from a list |
| App | `workspace_app_installs` row | a table named after the app exists |
| Connection | `entity_connections` row | it is in `platform_connections` |
| Device App | `workspace_device_apps` row | the Android app is installed on a phone |
| Plugin | `workspace_plugin_installs` row | the host app supports it |
| Automation | `workspace_automation_installs` row | it ran once |

Those six mechanisms must never be conflated. Installing Song Request creates an
app installation — it does not create `entity_module = song_request`.

## Constraints these screens assume

- **No dashboard holds a database key.** Every read and write goes through
  `gcr-api-clean`. This repo already made that move; the screens keep it.
- **The slug is never taken from the request.** Which business a caller is comes
  from the session via `entity_owners`. Admins are the one exception and are
  checked against `platform_admins` first.
- **Apps are remote.** The dashboard loads an installed app through a generic
  AppHost against a versioned manifest and a scoped short-lived token. It never
  imports the app's source. Uninstalling removes the mount, not the business's
  canonical data.
- **Automations request capabilities, not clicks.** `facebook.post.create` is
  satisfied by the API, a browser, or Android at runtime — the workflow does not
  know which, and does not care.
- **Every action ends in verification and a receipt.** Read the outcome back
  from the destination; record who asked, what was requested, which executor
  ran it, expected vs. actual, and evidence.

## Notes on the files

- Every screen is standalone: CSS and JS are inlined, no CDN, no font file, no
  shared `app.js`. Open any one of them directly.
- Links between screens were rewritten from bare filenames to the new relative
  paths when the screens were filed into folders. All 1,246 resolve.
- `manifest/page-manifest.{csv,json}` lists all 176 with group, folder, path,
  title, purpose, and the next screen in the flow — `next` is a path now, so it
  can drive a guided walkthrough.
- `prototype-2026-08-early/` is the earlier, smaller 22-screen pass at the same
  ideas, kept flat and unmodified for comparison. It is superseded by `screens/`.
- The two uploads' loose top-level copies were byte-identical duplicates of files
  inside them and were not copied twice.

## Related

- `docs/artist-mockups/` — the artist/venue module mockups, a different set.
- `docs/PORT_REVIEW.md` — what the fan-facing pages in `gcr-unified` still
  hardcode.
