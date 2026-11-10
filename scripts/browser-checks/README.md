# Browser checks

Playwright scripts that load the built app in a real browser against a stubbed API. They need no credentials and no network.

Drive the owner dashboard against a stub API (no credentials needed): `calendar.cjs` (availability calendar), `calendar-bad-payload.cjs` (a malformed response must show an error, never blank the page) and `first-run.cjs` (invite link, password, sign-in, first dashboard).

## Run

```
npm run build && npx vite preview --port <port> &
node scripts/browser-checks/<script>.cjs
```

Each script's header gives its default port and options (`BASE_URL`, `OUT_DIR` for screenshots, `PW_CHROMIUM` to point at an installed Chromium if this repo pins its own Playwright). The assertion-style scripts exit non-zero when a check fails. The route-pass scripts (`routes-pass.cjs`, `sections-pass.cjs`) only report what they flagged, so read their summary.
