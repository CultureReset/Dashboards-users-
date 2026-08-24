# Session audit — every change, with the command to verify it

Written by Claude. **Do not trust it. Run the commands.**

Every claim below is paired with a command that confirms or refutes it. If a
command's output disagrees with the claim, the claim is wrong.

Baseline for every comparison is `f323f55`, the last commit before this session.

    git log --oneline -1 f323f55

---

## 1. The four commits

| # | SHA | Message |
|---|---|---|
| 1 | `ea7bed9` | File the Ghost UI/UX screens by architecture layer |
| 2 | `bf38c64` | Add every UI/UX set as delivered, unmodified |
| 3 | `9ae2b2a` | Add foundation kernel corpus and concept documents, unmodified |
| 4 | `11f92de` | Add sales pages and the availability-sync diagram, unmodified |

    git log --format="%h  %s" f323f55..HEAD | tac

Per-commit file counts (A=added, M=modified, D=deleted, R=renamed):

| SHA | Added | Modified | Deleted | Renamed |
|---|---|---|---|---|
| `ea7bed9` | 202 | 1 | 0 | 0 |
| `bf38c64` | 292 | 0 | 0 | 0 |
| `9ae2b2a` | 61 | 0 | 0 | 1 |
| `11f92de` | 4 | 0 | 0 | 0 |

    for c in ea7bed9 bf38c64 9ae2b2a 11f92de; do
      echo "$c"; git show --name-status --format="" $c | awk '{print $1}' | sort | uniq -c
    done

---

## 2. CLAIM: no application code was touched

**Claim.** Across all four commits, zero files changed under `src/`, `sql/`,
`scripts/`, `package.json`, `vite.config.js`, `index.html`, `public/`.

    git diff --stat f323f55..HEAD -- src/ sql/ scripts/ package.json vite.config.js index.html public/

**Expected: no output.** Any output refutes the claim.

Per commit:

    for c in ea7bed9 bf38c64 9ae2b2a 11f92de; do
      echo -n "$c "; git show --name-only --format="" $c -- src/ sql/ scripts/ package.json vite.config.js index.html public/ | wc -l
    done

**Expected: `0` on every line.**

Independent check — can the app even reach the added folders?

    grep -rn "ghost-uiux\|docs/uiux\|docs/foundation\|sales-pages" src/

**Expected: no output.** Nothing in `src/` references any of it.

---

## 3. CLAIM: nothing was deleted

    git log --diff-filter=D --name-only --format="" f323f55..HEAD

**Expected: no output.**

**Caveat, stated because it will otherwise look like a lie.** Commit `9ae2b2a`
contains one rename. Git reports it as `R100` (100% identical content):

    git show --name-status --format="" 9ae2b2a | grep '^R'

Under `--no-renames` the same change prints as a delete plus an add:

    git show --name-status --no-renames --format="" 9ae2b2a | grep -i "App_Store_Builder"

Both lines describe the same file. Its content is unchanged; only the filename
lost an upload-hash prefix (`3f48e081-`). Verify content is untouched:

    git show 9ae2b2a^:"docs/uiux/documents/3f48e081-Ghost_App_Ecosystem_App_Store_Builder_SDK_Master_Document.docx" | sha256sum
    git show 9ae2b2a:"docs/uiux/documents/Ghost_App_Ecosystem_App_Store_Builder_SDK_Master_Document.docx"          | sha256sum

**Expected: identical hashes.**

Two other `.docx` files got the same prefix strip in that commit, but they were
added in the same commit, so git shows them only as adds.

---

## 4. CLAIM: only one thing of the user's was ever edited

**Claim.** In commit `ea7bed9` only, 1,246 `href=` values inside 176 HTML files
were rewritten from bare filenames to relative subfolder paths. **No other byte
of user content was changed in any commit.**

Example — same file, both copies now in the repo:

    grep -o 'href="[^"]*"' docs/uiux/ghost_actual_uiux_demo/dashboard-home.html      | head -5   # untouched copy
    grep -o 'href="[^"]*"' docs/ghost-uiux/screens/03-owner-dashboard/dashboard-home.html | head -5   # edited copy

Prove the edit was hrefs and nothing else — normalise every href, then diff:

    for f in docs/uiux/ghost_actual_uiux_demo/*.html; do
      n=$(basename "$f")
      e=$(find docs/ghost-uiux/screens -name "$n" | head -1)
      [ -n "$e" ] || continue
      a=$(sed 's/href="[^"]*"/href=X/g' "$f" | sha256sum | cut -d' ' -f1)
      b=$(sed 's/href="[^"]*"/href=X/g' "$e" | sha256sum | cut -d' ' -f1)
      [ "$a" = "$b" ] || echo "DIFFERS BEYOND HREFS: $n"
    done

**Expected: no output.** Any filename printed refutes the claim.

**Precise counts.** 1,246 `href` values were processed. 911 became
cross-folder paths (`../`); the other 335 pointed at a file in the same folder
and stayed bare. "1,246 links rewritten" above means 1,246 were passed through
the rewrite; only 911 visibly changed.

    grep -rho 'href="\.\./[^"]*"' docs/ghost-uiux/screens | wc -l   # expected 911
    grep -rho 'href="[^"]*"'        docs/ghost-uiux/screens | wc -l   # expected 1246

---

## 5. CLAIM: the copies in `docs/uiux/`, `docs/foundation/`, `docs/sales-pages/` are byte-identical to what was uploaded

These were verified with `diff -r` and `cmp` against the uploads at the time of
each commit. The uploads live outside the repo and will not survive this
session, so **this claim is not independently reproducible later.** It rests on
the transcript.

What *is* reproducible: the same screens exist twice in the repo — edited in
`docs/ghost-uiux/`, unedited in `docs/uiux/`. §4 compares them.

Also reproducible — the unedited copies use bare filenames, and every one of
them resolves:

    python3 - <<'PY'
    import os,re,glob
    for d in ['ghost_actual_uiux_demo','ghost_ui_ux_standalone','ghost_full_ui_ux']:
        tot=bad=0
        for p in glob.glob(f'docs/uiux/{d}/*.html'):
            for h in re.findall(r'href="([^"]+)"',open(p,encoding='utf-8').read()):
                if h.startswith(('#','http','mailto')): continue
                tot+=1
                if not os.path.isfile(os.path.join('docs/uiux',d,h)): bad+=1
        print(f'{d:26} {tot:5} links  {bad} broken')
    PY

**Expected:** 1246/0, 283/0, 1320/0.

Same check on the edited copies:

    python3 - <<'PY'
    import os,re,glob
    tot=bad=0
    for p in glob.glob('docs/ghost-uiux/screens/*/*.html'):
        for h in re.findall(r'href="([^"]+)"',open(p,encoding='utf-8').read()):
            tot+=1
            if not os.path.isfile(os.path.normpath(os.path.join(os.path.dirname(p),h))): bad+=1
    print(tot,'links',bad,'broken')
    PY

**Expected:** 1246 links, 0 broken.

---

## 6. What is now on disk

| Path | Files | What | Edited? |
|---|---|---|---|
| `docs/ghost-uiux/` | 202 | 176+22 screens in invented subfolders, manifest, index, README | **YES — hrefs rewritten** |
| `docs/uiux/` | 295 | the same screens plus the 82-screen set, flat | no |
| `docs/foundation/` | 58 | 4 SQL, index.js, package.json, manifest.json, 51 PDFs | no |
| `docs/sales-pages/` | 4 | 3 sales pages, 1 diagram PNG | no |

    for d in docs/ghost-uiux docs/uiux docs/foundation docs/sales-pages; do
      echo "$d = $(find $d -type f | wc -l)"; done

`docs/uiux/` breakdown:

| Subfolder | Files |
|---|---|
| `ghost_actual_uiux_demo/` | 179 (176 screens + manifest.csv/json + README.txt) |
| `ghost_full_ui_ux/` | 83 (82 screens + README.md) |
| `ghost_ui_ux_standalone/` | 25 (22 screens + styles.css + app.js + README.md) |
| `documents/` | 8 |

**`docs/ghost-uiux/` and `docs/uiux/` hold the same 198 screens twice** — once
edited, once not. That duplication is real and was left in place because the
user instructed that nothing be deleted.

---

## 7. Things that are broken or incomplete

Not opinions — check each one.

**`docs/uiux/documents/Complete_Mobile_UX_index.html` is mostly dead links.**
It indexes 165 pages; most were never uploaded.

    python3 - <<'PY'
    import re,os,glob
    idx=open('docs/uiux/documents/Complete_Mobile_UX_index.html').read()
    want=sorted(set(re.findall(r'href="([^"]+\.html)"',idx)))
    have={os.path.basename(p) for p in glob.glob('docs/uiux/*/*.html')}
    missing=[w for w in want if w not in have]
    print(f'{len(want)} indexed, {len(missing)} missing')
    PY

**Expected: 165 indexed, ~125 missing.**

**`docs/sales-pages/Gulf_Coast_Radar_mobile_listing_sales_page.html` will not
render offline.** It pulls covers, galleries and logos from external hosts.

    grep -o 'https://[a-z0-9.-]*' docs/sales-pages/Gulf_Coast_Radar_mobile_listing_sales_page.html | sort -u

Every other prototype in the repo is self-contained:

    grep -l 'https://images\|s2/favicons' docs/uiux/*/*.html | wc -l    # expected 0

**Two sales pages ship a placeholder email** — `hello@example.com` on the CTA
buttons.

    grep -o 'mailto:[^"?]*' docs/sales-pages/*.html | sort -u

**`docs/uiux/ghost_ui_ux_standalone/styles.css` and `app.js` are dead files.**
No page in that folder references them.

    grep -l 'styles.css\|app.js' docs/uiux/ghost_ui_ux_standalone/*.html | wc -l   # expected 0

---

## 8. Analysis, not fact — contradictions in the source documents

Everything above is mechanically checkable. **This section is not.** It is one
reading of the uploaded documents and should be argued with.

| Conflict | Source A | Source B |
|---|---|---|
| How many installable ecosystems | "six" (Separation blueprint) | "four primary, plugins a fifth class" (Ecosystem architecture) |
| What `entity_modules` is | per-business Data Module install record (Separation) | rename to `entity_module_preferences`, "never use it as proof that the data exists" (Ecosystem) |
| What a Plugin is | reusable capability in a host — QR generator, PDF export (all architecture docs) | "connects CyberCheck to outside software" — Gmail, Calendar (CyberCheck sales page) — that is Connections everywhere else |
| Are modules chosen or discovered | "data creates modules automatically" | `module_catalog` → `entity_modules` catalog/install pair, which is a chosen-module model |
| Which UI is canonical | 176-screen blue mobile | 82-screen teal desktop-sidebar, and a 165-page index for a third |

Claims that appear in **every** source and are contradicted by none:

1. Canonical tables store truth; external platforms are observations, never columns.
2. Capabilities are business verbs; executors (API, browser, Android) are interchangeable underneath.
3. A click is not success — verified state is, followed by a receipt.
4. A data module appears because rows exist.
5. Installing an app creates an install record, not a module.
6. Uninstall revokes access; business data remains.
7. No dashboard holds a database key; the slug comes from the session, never the request.
8. Ghost owns contracts, publishers own implementations, the business owns its data.

---

## 9. Divergence between `src/` and the documents

**Claim.** `src/` discovers a business section from any table carrying an
`entity_slug` column. The documents say that rule is too broad and needs a
classification registry (`DATA_MODULE` / `APP_PRIVATE` / `CUSTOMER_SUBMISSION` /
`PLATFORM_INTERNAL` / …). Under the current rule an app-private table such as
`song_requests` would surface as a generic business section.

    grep -rn "entity_slug" src/lib/schemaDiscovery.js src/lib/discoverSections.js src/lib/sectionCatalog.js

Read those three files and judge for yourself. Note `sectionCatalog.js` does
hold back some tables by naming and column convention — so the divergence is
partial, not total.

Two further items, from the repo's own README and the uploaded snapshots, not
verified against the live database by this session:

- `entity_owners` reportedly has 0 rows, which blocks owner login.
- No observation/provenance table exists live, so the canonical-vs-Google-vs-Yelp
  sync matrix cannot be built yet.

---

## 10. What was never done

- No pull request opened.
- No database touched. No migration run. No `execute_sql`.
- No file deleted, in any commit.
- No dependency added or changed.
- No `src/` file created, edited or removed.
- Nothing pushed to any branch other than `claude/dashboard-folder-structure-wqsm9i`.

    git branch -r --contains HEAD

---

## 11. Full state check

    npm run check          # expected: All checks passed
    npm run build          # expected: builds clean
    git status --porcelain # expected: empty
    git log --oneline -5
