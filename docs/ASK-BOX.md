# The Ask box

A text box at the top of the owner app grid (`src/front/AppHome.jsx`). The owner
says what they want in plain words ("update my hours", "reply to my newest
review", "add a special for Friday"). Each customer business is a Paperclip
company with agents; the ask becomes an issue there, assigned to the company's
lead agent. The agent's last comment is the answer.

It is the same thing the owner's own NODE does
(`apps/boxes` `daemon/src/modules/paperclip.ts`), from the browser.

## Files

| file | job |
| --- | --- |
| `src/ask/askClient.js` | all Paperclip logic; every function takes an injected `fetch` |
| `src/ask/askStore.js` | what this browser remembers (localStorage, try/catch, per business) |
| `src/ask/useAsks.js` | React state: access, recent asks, background polling |
| `src/ask/AskBar.jsx`, `ask.css` | the UI; borrows the launcher's `--fl-*` tokens |
| `src/front/AppHome.jsx`, `Tile.jsx` | additive: mounts the bar; "Ask about this" button per tile |
| `src/pages/Dashboard.jsx` | passes `businessName`, `viewingAs`, `onOpenView` to AppHome |
| `src/lib/paperclip.js` | additive: each call accepts an optional `fetchImpl` (default: global fetch, unchanged) |
| `scripts/check-ask.mjs` | 47 offline checks against a stub Paperclip; part of `npm run check` |

The browser reaches Paperclip only through the same-origin `/api/paperclip`
proxy (`api/paperclip.js`). No new key, no new proxy route.

## The flow

1. **Can we ask?** `GET /auth/get-session`, then `GET /companies?scope=accessible`
   (the two calls `Platform.jsx` makes). One company: use it. Several: the owner
   picks once; the choice is remembered per browser and per business. A remembered
   id that is no longer accessible is ignored.
2. **Who gets it?** The lead agent (rule below).
3. **Create.** `POST /companies/<company>/issues` with
   `{title, description, status: 'todo', assigneeAgentId}`. The title is the first
   line of the question (90 chars). The description is the question, a standing
   instruction (answer, post a short plain-language comment, set the issue to
   done), the business name from the dashboard's entity ("the owner of Harbor
   Grill"; "the business owner" if unknown) and the marker line
   `[NEXTGENT ask <uuid>]`. No person's name is written anywhere in `src/ask`.
4. **Follow.** `GET /issues/<id>` and `GET /issues/<id>/comments`. The answer is
   the newest comment with `authorType: 'agent'` whose body does not start with
   `Warning:`. Stops at `done`, `cancelled`, `blocked`, `in_review`.
   Backoff: first look after 3 s, then x1.5 up to 15 s; hard stop at 600 s (the
   NODE's timeout; the NODE polls every 5 s flat).
5. **Show.** Plain chips: Working, Done, Needs you, Failed.
   `blocked` = Needs you (with Paperclip's status text and a link to My Ghost,
   the existing screen that lists approvals); `cancelled` = Failed;
   `in_review` = Done if there is an answer, else Needs you; an ask left
   unassigned and sitting in `todo` = Needs you (it is not "working").

### Never created twice

A create call that fails without telling us whether the issue exists (network
error after send, 5xx, an unreadable reply) is **ambiguous**. Before any resend
the client searches the company's recent issues for the marker:

- found: use that issue (`reconciled`);
- searched and not found: send again, three sends at most;
- the search itself failed: stop with `unconfirmed`. Nothing is resent. The ask
  shows "Needs you / Not confirmed" and a "Check and send if needed" button,
  which reuses the same uuid and searches first.

An ask whose page closed mid-send comes back as unconfirmed for the same
reason. Definite failures (401, 403, 4xx, 503 "not configured") are not
ambiguous and are not retried.

### The lead-agent rule

Agents whose `status` is terminated, archived, deleted, paused, disabled or
inactive are ignored. Then the first rule that picks exactly one agent wins:

1. exactly one agent whose `role`, `title` or `name` is "CEO";
2. exactly one agent named "Lead" (what the NODE calls its assignee);
3. exactly one agent that reports to nobody (`reportsTo` empty: top of the org chart);
4. the agent created first (`createdAt`, then list position).

A rule that matches several agents is skipped (it would be a guess). If no
agent can be listed or none is active, the issue is created **without an
assignee** and the answer card says so ("left unassigned ... Assign it in
Paperclip"). `createAsk(..., {leadAgentId})` overrides the rule (string) or
forces unassigned (`null`), which is where a per-business mapping will plug in.

### States

Every one is designed, with a next step:

- viewing as an admin / impersonating: **asking is off** with a message; no
  Paperclip call is made, so a question can never land in the admin's own company;
- not signed in to Paperclip (401): explanation and **Open sign-in** (opens the
  existing Platform screen), then **Check again**;
- proxy not configured (503 `PAPERCLIP_SERVER_URL`): says what is missing and who fixes it;
- Paperclip unreachable: "your question was not sent", Check again;
- no accessible company: tells them to ask the platform owner to add them;
- several companies: picker, remembered, "Change" link;
- blocked / needs approval, timeout (see below), unconfirmed, failed: on the ask itself.

**Timeout.** After 10 minutes polling stops for that session and the card says
so. The ask stays in the list; on the next open every ask that is not final and
younger than 24 h is checked again at once (`immediate`) and polled on.

Voice input appears only if `window.SpeechRecognition` or `webkitSpeechRecognition`
exists. The answer is rendered as plain text, never as markup.

## What Paperclip's API is assumed to do

| call | status |
| --- | --- |
| `GET /auth/get-session`, 401 = signed out | confirmed from code: `src/lib/paperclip.js`, `scripts/test-paperclip.mjs` |
| `GET /companies?scope=accessible` (array, or `{companies}`) | confirmed from code: `src/lib/paperclip.js`, `Platform.jsx` |
| 503 `PAPERCLIP_SERVER_URL is not set` from the proxy | confirmed from code: `api/paperclip.js`, `scripts/test-paperclip-proxy.mjs` |
| `POST /companies/<id>/issues {title, description, status, assigneeAgentId}` -> `{id, identifier, status}` | confirmed from code: box `daemon/src/modules/paperclip.ts` |
| `GET /issues/<id>` -> `{status}` | confirmed from code: same file |
| `GET /issues/<id>/comments` -> `[{body, authorType, createdAt}]`, agent comments have `authorType: 'agent'` | confirmed from code: same file |
| status values `todo`, `done`, `cancelled`, `blocked`, `in_review` | confirmed from code: same file. `in_progress` (and anything else) is treated as "still working": assumed |
| `GET /companies/<id>/agents` returning agents (array or `{agents}`) | **assumed.** Not used anywhere in this repo or the box. A route of that name appears only in a survey note about Paperclip's server, which is not code this repo can verify. Failure (404, network, odd shape) = create unassigned |
| agent fields `role`, `title`, `name`, `status`, `reportsTo`, `createdAt` | **assumed** (used only by the lead rule; absent fields just skip a rule) |
| `GET /companies/<id>/issues` (list, with `?q=<uuid>`, and plain as fallback), rows with `description`, `createdAt`, `id` | **assumed.** Used only to reconcile an ambiguous create. Rows without `description` are read with `GET /issues/<id>` (confirmed). If the list does not work the ask is reported unconfirmed, never resent |
| a `blocked` / `in_review` issue is resolved through an approval the owner can act on in My Ghost | **assumed.** My Ghost's approvals list (`/approvals` on the box) is the box's own, not Paperclip's |

If the two assumed endpoints turn out wrong, the box still works: asks are
created unassigned and an ambiguous failure asks the owner to check, instead of
guessing.

## Not done

- **Real company-per-business mapping.** The company comes from what the
  signed-in Paperclip account can access (picked once, remembered). The
  authoritative link, `company_links` in gcr-api-clean, is not read here. Until
  it is, a person who can access several companies chooses; an admin cannot ask
  on a business's behalf (disabled on purpose).
- **Approvals UI.** A blocked ask shows Paperclip's status and links to My Ghost;
  there is no Approve / Reject here.
- **Attachments** (photos, menus, PDFs) on an ask.
- Paperclip's own comment thread: only agent answers are shown; the owner cannot
  reply on the issue from here.
- Server-side history: the recent list is this browser's localStorage only.
