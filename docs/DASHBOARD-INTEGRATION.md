# Dashboard integration

Branch `merge/dashboard-integration` brings three dashboard branches together on
top of `main` at `d290da4` (PRs #16 and #17: the Paperclip proxy, navigation
fixes and the Setup page). All three branches were already based on that
commit, so none of them needed rebasing and none of main's changes made a
branch's assumption false.

Merge order, each a merge commit (no history rewritten):

1. `fix/dashboard-ux-bugs` (32313b1)
2. `feat/front-layer` (506ad76; it contains the UX branch, so this brought only the front layer)
3. `feat/onboarding-wizard` (e282b6e)

## What came from where

**fix/dashboard-ux-bugs**: `discoverSections` id merge, `lib/actingScope.js`
(admin View-as scope on every owner-scoped call), `lib/dashboardView.js` reducer
(one value for "which screen is open"), BottomNav with the More sheet, Toast,
ConfirmSheet, `useFocusTrap`, ErrorBoundary, safe-area and touch-target CSS,
silent reloads after a save.

**feat/front-layer**: `src/front/*` (app-tile grid home, AppFrame, tiles,
long-press edit mode, `theme.css`), `home` and `app` views in the reducer, the
Apps button in BottomNav, `scripts/check-front.mjs`, `docs/FRONT-LAYER.md`.

**feat/onboarding-wizard**: `src/pages/Onboarding.jsx` (Welcome, Apps, Tools,
Done), `src/onboarding/*`, `scripts/check-onboarding.mjs`, the sign-up marker in
`SignUp.jsx`, the menu entry in `TopBar.jsx`, `viewport-fit=cover`.

**main (kept intact)**: `Setup.jsx`, `lib/setupGuide.js`, `lib/signupFlow.js`,
`api/paperclip.js`, `lib/paperclip.js` and their tests.

## Conflicts and how they were resolved

Only the third merge conflicted. Three files:

- `package.json`: both sides rewrote the `check` script. Now runs discovery,
  front, onboarding and the three main node tests (below).
- `src/index.css`: both sides appended at the end of the file. Kept the UX
  branch's block. The wizard's safe-area rule for `.topbar` and `.bottom-nav`
  was dropped: the UX branch already pads both with `env(safe-area-inset-*)`
  where they are defined (lines ~309 and ~448), and the wizard's copy used
  `max()` on the top bar sides, which would have made the padding narrower.
  `viewport-fit=cover` in `index.html` is kept.
- `src/pages/Dashboard.jsx`: the wizard branch still had the eight `show*`
  booleans and `clearOverlays`. Took the reducer version wholesale and
  re-attached the wizard to it. No new `show*` booleans were added; the wizard
  is a full-screen takeover (`wizardOpen`) that returns before the shell
  renders, the same way it did on its own branch.

Non-conflicting but adapted:

- The wizard branch's `useOnboardingGate` made its own `GET /api/store` call.
  The launcher already makes that call (`useStoreApps`), so the gate now takes
  its inputs from the dashboard and makes no request. `useStoreApps` gained
  `known` (the call succeeded) so "no apps" and "could not find out" stay
  distinct, as the wizard requires.
- `shouldAutoShow` gained an optional `sectionCount`, and no longer opens for a
  fresh sign-up marker if something is already installed. Existing check cases
  are unchanged.
- TopBar menu: the wizard's entry was labelled "Setup", which now collides with
  main's Setup page. The menu offers both: "Setup" (the Setup page, also a
  tile and a BottomNav tab) and "Guided setup" (the wizard; hidden in admin
  View-as).

## Landing rules

One function, `decideLanding()` in `src/lib/dashboardView.js`, returns
`wizard`, `home` or `setup`:

| Business | Lands on |
| --- | --- |
| zero installs and zero sections with data, never dismissed or finished, not admin View-as | the onboarding wizard, once |
| at least one install or one section | the app grid |
| anything else (wizard dismissed or finished and nothing exists yet, store unknown and not a fresh sign-up) | the Setup page |

Details:

- The wizard decision waits until the entity, the section sweep and the Store
  list have arrived, and is made once per business (`useOnboardingGate`).
  Dismissing (the close button) or finishing is remembered in localStorage and
  it does not return. "Guided setup" in the menu reopens it any time.
- "Section with data" for the wizard means a section that is not an
  enabled-but-empty module stub. Stubs still count for the grid, because they
  produce tiles. Choice made so a real new sign-up whose default modules show
  up as empty stubs still gets the wizard. This is the one place the two counts
  differ; it is covered by `check-onboarding`.
- Admin View-as and impersonation never open the wizard and never show its
  menu entry. They still get the grid or the Setup page by the same rule.
- The view reducer remains the only navigation state. After the wizard closes,
  an owner who installed something lands on the grid (unless they have already
  navigated).
- Behaviour change: `docs/FRONT-LAYER.md` says a brand-new business "starts on
  Setup". It now starts on the wizard, and on Setup after the wizard is closed.

## Running the checks

```bash
npm ci
npm run lint      # oxlint. 0 errors, 4 warnings (style hints in four files)
npm run check     # everything below, in this order, stops at the first failure
npm run build     # vite build
```

`npm run check` runs:

| Command | Covers |
| --- | --- |
| `node scripts/check-discovery.mjs` | section discovery, table mapping, view reducer, acting scope |
| `node scripts/check-front.mjs` | tiles, layout, long-press, landing, front reducer views |
| `node scripts/check-onboarding.mjs` | wizard logic, recommendations, storage rules, plus the integrated `decideLanding` cases |
| `node --test scripts/test-setup.mjs scripts/test-paperclip.mjs scripts/test-paperclip-proxy.mjs` | Setup guide and sign-up flow (main, PR #17), Paperclip client and SPA routing, Paperclip proxy function (main, PR #16). These three were not in `npm run check` on main; they are now. |

None needs credentials or network. `scripts/test-*.mjs` can also be run alone
with `node --test <file>`.

## Screenshots

Rendered against a stub API (every request to the API host is intercepted in
Playwright; nothing live is called). Script:
`scratchpad/integ-shots/shoot.cjs`, run against `vite preview` of the built
branch. 16 browser assertions pass (wizard opens for the new owner, not after
dismissal and reload, never in View-as, grid for the restaurant and the
charter, Setup reachable from tile and menu). Files `merged-*.png` cover: new
owner welcome and apps steps (phone, desktop, dark), restaurant with merch
store grid, charter with 12 sections grid, the More sheet, admin View-as
(empty business and restaurant), an opened app, dark mode grid.

## Not verified

- Anything against the live API: endpoint shapes are those the branches
  already assumed (`/api/store`, `/api/connections`, `/api/owner/modules`).
- Whether a real new sign-up actually has zero sections; the stub says so.
- Real phones, iOS Safari (safe-area insets, 16px input zoom, standalone mode),
  Android back button.
- Screen readers. The wizard and sheets set dialog roles, focus and labels, but
  nothing was run with VoiceOver, TalkBack or NVDA.
- Reduced-motion, high-contrast and landscape on a device.
- Multi-business owners switching businesses mid-session (the gate decides once
  per slug; `useStoreApps` does not clear its items on a slug change).
