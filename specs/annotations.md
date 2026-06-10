# Spec: Annotations (inline comments on posts)

Status: draft, pre-implementation. Source idea: `later.md` → "Annotations".

Readers can comment on essays by highlighting a portion of text and attaching a
comment to it, Google-Docs style. Comments support threaded replies, an
optional per-comment name, a visible author identity for David, and global and
per-thread visibility toggles.

## Decisions already made (with David)

- **Backend**: Cloudflare Worker + D1. The site stays a static Astro build on
  GitHub Pages; a small separate Worker project provides the comments API on a
  subdomain (e.g. `api.david-bloom.com`), using the Cloudflare account that
  already manages DNS for `david-bloom.com`.
- **Author identity**: secret passphrase. David enters it once per device via a
  hidden entry point; it is stored in `localStorage` and sent with author
  actions, verified server-side. Regular readers never see any passphrase UI.
- **Moderation**: author can delete/hide any comment or thread from the page
  (in author mode); server-side rate limiting and length caps; email
  notification to David on each new comment.
- **Placement (OPEN)**: pending mockups. Option A: popover panel opened by
  clicking a highlight. Option B: Google-Docs-style cards in the right margin,
  sharing the column with sidenotes. The spec below is written to work with
  either; placement-specific details are flagged.

## Non-goals

- No accounts, profiles, logins, or emails for readers.
- No likes/votes, editing of posted comments, or markdown in comments
  (plain text only, rendered escaped; URLs not auto-linked in v1).
- No pre-moderation queue (rejected: kills conversational feel).
- No comments on the homepage or /feed — essays only.

## Architecture overview

```
Browser (static essay page)
  └── annotations.js island (vanilla JS, loaded on essay pages)
        │  GET/POST JSON, CORS-restricted to david-bloom.com
        ▼
Cloudflare Worker (separate repo dir: /worker or separate repo)
  ├── D1 database (comments)
  ├── rate limiting (per-IP)
  └── email notification on new comment
```

The Astro site gains one new client-side module and some CSS; it has no
build-time knowledge of comments. The Worker is deployed independently with
Wrangler.

## Data model (D1)

One table; threads are a parent-child relation.

```sql
CREATE TABLE comments (
  id            TEXT PRIMARY KEY,          -- nanoid/uuid
  post_slug     TEXT NOT NULL,             -- e.g. "grounding-of-zetetic-norms"
  parent_id     TEXT,                      -- NULL for top-level (anchored) comments
  anchor_json   TEXT,                      -- NULL for replies; see Anchoring
  body          TEXT NOT NULL,             -- plain text, max 4000 chars
  display_name  TEXT,                      -- optional, max 40 chars; NULL = anonymous
  commenter_key TEXT NOT NULL,             -- random client token, see Numbering
  is_author     INTEGER NOT NULL DEFAULT 0,
  hidden        INTEGER NOT NULL DEFAULT 0, -- author-hidden (thread stays, content suppressed)
  deleted       INTEGER NOT NULL DEFAULT 0, -- soft delete
  created_at    TEXT NOT NULL              -- ISO 8601
);
CREATE INDEX idx_comments_post ON comments(post_slug, created_at);

CREATE TABLE commenter_numbers (
  post_slug     TEXT NOT NULL,
  commenter_key TEXT NOT NULL,
  number        INTEGER NOT NULL,          -- 1, 2, 3… per post
  PRIMARY KEY (post_slug, commenter_key)
);
```

### Numbering anonymous commenters

Per `later.md`: a commenter without a name is shown as “#N”, stable enough
that you can follow who replies to whom within threads.

- On first use the client generates a random `commenter_key` (128-bit, hex) and
  keeps it in `localStorage` (wrapped in try/catch per repo rules).
- On the first comment by that key on a given post, the Worker assigns the next
  number for that post (`MAX(number)+1`, in a transaction) and records it.
- Display rule: if `display_name` is set, show the name; else show “#N”.
  The number is per-post, not global, and is shown even when the same person
  later supplies a name on another comment (each comment renders what it has —
  name on named comments, #N on unnamed ones; the key keeps N stable).
- David’s author comments show “David” plus an Author badge regardless of the
  name field; `is_author` wins.

## Anchoring highlights to text

Anchors must survive HTML rendering details and minor essay edits, and must
fail gracefully.

- Store a **TextQuoteSelector** in `anchor_json`, after the W3C Web Annotation
  Data Model: `{ exact, prefix, suffix }` — the selected text plus ~32 chars of
  context either side — plus a coarse position hint
  `{ headingId, charOffset }` for disambiguation when `exact` appears twice.
- Re-anchoring on page load: walk the text content of `.prose`, find
  `prefix + exact + suffix`; fall back to `exact` alone nearest the position
  hint; if nothing matches, the comment is **orphaned**.
- Orphaned comments are not lost: they appear in the post’s comment list
  (popover/panel “all comments” view, or end-of-margin in Option B) with a note
  “the highlighted passage has changed”.
- Selection constraints: selections must be within `.prose`, not inside a
  sidenote, ≤ 1000 characters, and non-empty after trimming. The selection
  toolbar simply doesn’t appear otherwise.

### Rendering highlights

Use the **CSS Custom Highlight API** (`CSS.highlights`, `::highlight()`),
which paints ranges without mutating the DOM — important because the sidenote
script moves nodes between inline and margin homes, and KaTeX produces deep
markup that span-wrapping would corrupt. Browsers without support get no
visible highlight but still get the comment list; feature-detect
`CSS.highlights` and degrade silently. (Reviewer: verify current browser
support and that highlights can carry distinct styles per thread state —
default vs. active/open.)

Highlight styling: a low-opacity accent underline/tint via `--accent`, with a
stronger tint for the currently open thread. Must be visible in both themes
(`[data-theme="dark"]` swaps `--accent`).

## API (Worker)

All endpoints JSON; CORS `Access-Control-Allow-Origin: https://david-bloom.com`
(plus `http://localhost:4321` in dev via env var).

| Method & path | Auth | Purpose |
| --- | --- | --- |
| `GET /v1/comments?post=<slug>` | none | All visible comments + numbers for a post |
| `POST /v1/comments` | none | Create comment or reply |
| `POST /v1/author/login` | passphrase | Verify passphrase, returns ok (client then stores it) |
| `DELETE /v1/comments/:id` | passphrase header | Soft-delete a comment (or whole thread via `?thread=1`) |
| `POST /v1/comments/:id/hide` / `unhide` | passphrase header | Toggle `hidden` |

- `POST /v1/comments` body: `{ post, parentId?, anchor?, body, name?, commenterKey, author? }`.
  `anchor` required iff `parentId` absent. If `author: true`, the passphrase
  header must validate, else 401.
- `GET` response excludes `deleted` rows; `hidden` threads are returned as
  stubs (`{ id, hidden: true }`) so the client can show “thread hidden by
  author” and keep highlight positions stable.
- Passphrase: stored as a Worker secret (e.g. `AUTHOR_PASSPHRASE` via
  `wrangler secret`), compared constant-time. Sent as `Authorization: Bearer`.
  No sessions/JWT — single user, low stakes.

### Rate limiting & abuse controls

- Per-IP: max 5 comments/minute and 50/day. Use Cloudflare Workers’ rate
  limiting binding if available on the free plan; otherwise a D1/KV counter
  keyed by IP with TTL semantics. (Reviewer: verify the rate-limiting binding’s
  plan availability in current Cloudflare docs and recommend the mechanism.)
- Body ≤ 4000 chars, name ≤ 40 chars, anchor `exact` ≤ 1000 chars; reject
  oversized payloads early (`Content-Length` cap).
- Store only a salted hash of the IP if any IP is persisted; raw IPs are not
  written to D1.
- A hidden honeypot field in the form; bots that fill it get a 200 but the
  comment is dropped.

### Email notification

On each successful `POST /v1/comments` (non-author), the Worker sends David an
email with post, snippet, name/#N, and a direct link
(`https://david-bloom.com/essays/<slug>/#comment-<id>`). Mechanism: an email
API called from the Worker — candidate: Resend free tier with a verified
sending domain. (Reviewer: MailChannels’ free Workers integration was
discontinued; verify the current recommended way to send email from Workers in
2026 and pick one.) Failure to send must not fail the comment POST.

## Frontend behaviour

A single module, e.g. `src/scripts/annotations.js`, included from
`BlogPost.astro`. It must not interfere with `setupSidenotes()` or the TOC
script, and all `localStorage` access is wrapped in try/catch in its own IIFE
(repo rule: one feature’s init failure must not take down another’s).

### Reading

1. On load, fetch comments for the post (single GET, no client SDK).
2. Re-anchor each top-level comment; paint highlights via Custom Highlight API.
3. Clicking/tapping a highlight opens its thread (popover in Option A; scrolls
   to / focuses the margin card in Option B).
4. **Global toggle**: a small control (placement decided with mockups —
   likely near the essay header or with the subscribe button) switches all
   comment UI off/on for the post. State in `localStorage`
   (`annotations:enabled`, default on). Off = no highlights, no toolbar,
   no panels; the page looks exactly as it does today.
5. **Per-thread toggle**: each thread has a local “hide this thread” control
   (collapses card/highlight for this reader; stored per-thread in
   `localStorage`). Distinct from the author’s server-side `hidden`.

### Writing

1. Reader selects text in `.prose` → small floating “💬 Comment” button appears
   near the selection (mouseup/selectionchange; also works for touch via
   `selectionchange` debounce).
2. Clicking it opens a compose box: textarea + optional “Name” field
   (placeholder “anonymous — shown as #N”) + Post button. Esc/click-away
   cancels.
3. On post: optimistic insert, then reconcile with server response (which
   carries the assigned #N). Errors surface inline (“couldn’t post — try
   again”), never as alerts.
4. Replies: each thread has a reply box with the same name field.
5. The name field remembers its last value per browser (localStorage) but is
   always editable per comment.

### Author mode

- Entry: visiting any essay with `#author` in the URL hash (or a long-press on
  the global toggle — decide in implementation) reveals a passphrase prompt
  once; on success the passphrase is stored and the hash cleaned from the URL.
- In author mode: composer gains a pre-checked “comment as David (Author)”
  checkbox; every thread/comment shows Delete and Hide controls.
- Author badge rendering: name shown as “David”, an `AUTHOR` chip in
  `--font-ui` small caps, accent-colored — visually unmistakable, and backed by
  `is_author` from the server (not client-side cosmetics).

### Placement Option A — popover panel

- Threads render in a floating panel anchored near the clicked highlight
  (flipping to stay in viewport); on mobile (<64em) the same panel becomes a
  bottom sheet.
- An “all comments (N)” affordance near the global toggle lists every thread
  (and orphans) and jumps to highlights.

### Placement Option B — margin cards

- Top-level threads render as cards in the right margin column, vertically
  aligned with their highlights, interleaved with sidenotes using the same
  stacking algorithm as `positionSidenotes()` (cards and notes share one
  sorted-by-anchor-position layout pass; this is the main extra complexity).
- On mobile (<64em) the margin doesn’t exist; threads fall back to the
  popover/bottom-sheet behaviour from Option A. (So Option B is a superset:
  build A’s mobile path regardless.)

## Repo & deployment changes

- New: `worker/` directory in this repo (or sibling repo — prefer same repo,
  `worker/` with its own `wrangler.toml`, so the spec, site, and API version
  together). Deployed manually via `npx wrangler deploy` at first; a GitHub
  Action later if it churns.
- DNS: `api.david-bloom.com` routed to the Worker (Cloudflare-proxied, unlike
  the site’s DNS-only records).
- D1 database created via `wrangler d1 create`; schema applied with a
  `schema.sql` + `wrangler d1 execute`.
- Secrets: `AUTHOR_PASSPHRASE`, email API key.
- Site: `src/scripts/annotations.js` (+ CSS, either in the layout or a small
  stylesheet), loaded only on essay pages, deferred, and a no-op if the API is
  unreachable (the essay must never break because the Worker is down).

## Verification plan

- Unit-ish: Worker tested locally with `wrangler dev` + `curl` (create, reply,
  rate-limit trip, author auth fail/success, hide/delete).
- Browser: Playwright against `npx astro preview` at 1440px and 390px —
  select→comment flow, thread open/close, global toggle off leaves page
  pristine, dark mode highlight contrast, no sidenote layout regressions
  (resize across the 64em breakpoint with comments open).
- Orphaning: edit a fixture post’s paragraph and confirm the comment degrades
  to the orphan list rather than mis-anchoring.

## Open questions

1. Placement A vs. B — pending mockups (next step).
2. Email provider choice — pending doc verification (reviewer).
3. Rate-limiting mechanism (binding vs. D1 counter) — pending doc verification
   (reviewer).
4. Whether the global toggle default should ever be “off” for posts with no
   comments yet (probably moot: with zero comments the UI is invisible anyway
   except the selection toolbar).
