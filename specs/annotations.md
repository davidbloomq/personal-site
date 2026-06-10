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
- **Placement**: decided (from mockups) — Option B, Google-Docs-style cards in
  the right margin, sharing the column with sidenotes; bottom sheet on mobile.
  Comment cards must not clash with or crowd sidenotes (see Layout).
- **Visibility model**: all comments shown by default. A sticky “comments
  on/off” button switches the whole feature off — cards and highlights
  disappear entirely. “Hide” refers only to individual threads: it collapses
  a thread to a compact sidenote-like box that can be re-expanded.

## Non-goals

- No accounts, profiles, logins, or emails for readers.
- No likes/votes, editing of posted comments, or markdown in comments
  (plain text only; URLs not auto-linked in v1).
- No pre-moderation queue (rejected: kills conversational feel).
- No comments on the homepage or /feed — essays only.

## Architecture overview

```
Browser (static essay page)
  └── annotations.js island (vanilla JS, loaded on essay pages)
        │  GET/POST JSON, CORS-restricted to david-bloom.com
        ▼
Cloudflare Worker (this repo, /worker)
  ├── D1 database (comments)
  ├── rate limiting (ratelimit binding + D1 daily counter)
  └── email notification via Resend on new comment
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
  ip_hash       TEXT NOT NULL,             -- HMAC-SHA-256(secret, ip); never the raw IP
  is_author     INTEGER NOT NULL DEFAULT 0,
  hidden        INTEGER NOT NULL DEFAULT 0, -- author-hidden (thread stays, content suppressed)
  deleted       INTEGER NOT NULL DEFAULT 0, -- soft delete
  created_at    TEXT NOT NULL              -- ISO 8601
);
CREATE INDEX idx_comments_post ON comments(post_slug, created_at);
CREATE INDEX idx_comments_ip ON comments(ip_hash, created_at);

CREATE TABLE commenter_numbers (
  post_slug     TEXT NOT NULL,
  commenter_key TEXT NOT NULL,
  number        INTEGER NOT NULL,          -- 1, 2, 3… per post
  PRIMARY KEY (post_slug, commenter_key),
  UNIQUE (post_slug, number)
);
```

### Numbering anonymous commenters

Per `later.md`: a commenter without a name is shown as “#N”, stable enough
that you can follow who replies to whom within threads.

- On first use the client generates a random `commenter_key` (128-bit, hex) and
  keeps it in `localStorage` (wrapped in try/catch per repo rules). If
  `localStorage` is unavailable (Safari “Block all cookies”), generate a
  per-pageload key — numbering is then per-visit, which is acceptable.
- On the first comment by that key on a given post, the Worker assigns the next
  number for that post. Concurrency: do this as a single statement —
  `INSERT OR IGNORE INTO commenter_numbers VALUES (?post, ?key,
  (SELECT COALESCE(MAX(number),0)+1 FROM commenter_numbers WHERE post_slug=?post))`
  — then read the number back. D1 serializes writes per database and the
  `UNIQUE (post_slug, number)` constraint is the backstop; on constraint
  failure, retry once.
- `commenter_key` is a bearer secret for the #N identity: the API never returns
  it in any response (GET responses carry only the resolved number/name).
- Display rule: if `display_name` is set, show the name; else show “#N”.
  The number is per-post, not global; each comment renders what it has —
  name on named comments, #N on unnamed ones; the key keeps N stable.
- David’s author comments show “David” plus an Author badge regardless of the
  name field; `is_author` wins.

## Anchoring highlights to text

Anchors must survive HTML rendering details and minor essay edits, and must
fail gracefully.

- Store a **TextQuoteSelector** in `anchor_json`, after the W3C Web Annotation
  Data Model (§4.2.3): `{ exact, prefix, suffix }` — the selected text plus
  ~32 chars of context either side (`prefix`/`suffix` optional in the model;
  we always store them) — plus a position hint `{ charOffset }`: the index of
  the selection start in the post’s canonical text (defined next).
- **Canonical text**: the concatenated `textContent` of `.prose`, **excluding**
  (a) `.sidenote-ref` subtrees — sidenote text lives inline on mobile but is
  moved to the margin column on desktop, so including it would make offsets
  and prefixes differ by viewport — and (b) `.katex-mathml` (KaTeX renders a
  hidden MathML duplicate of every formula; only the visible `.katex-html`
  half counts). Selection capture and re-anchoring must both use this same
  text index, or anchors made on mobile won’t resolve on desktop.
- Re-anchoring on page load: find `prefix + exact + suffix` in the canonical
  text; if it matches more than once or not at all, fall back to `exact`
  alone, choosing the occurrence nearest `charOffset`; if nothing matches,
  the comment is **orphaned**.
- Orphaned comments are not lost: they stack at the end of the margin column
  (see Layout) with a note that the highlighted passage has changed.
- Selection constraints: selections must be within `.prose`, not inside a
  sidenote, ≤ 1000 characters, and non-empty after trimming. The selection
  toolbar simply doesn’t appear otherwise.

### Rendering highlights

Use the **CSS Custom Highlight API** (`CSS.highlights`, `::highlight()`),
which paints ranges without mutating the DOM — important because the sidenote
script moves nodes between inline and margin homes, and KaTeX produces deep
markup that span-wrapping would corrupt. Support (verified): Chrome 105+,
Safari 17.2+, Firefox 140+ (June 2025) — all evergreen browsers. Older
browsers get no visible highlight but still get the comment list;
feature-detect `CSS.highlights` and degrade silently.

- Distinct styles per state work: register two named highlights (e.g.
  `comments` and `comment-active`), style each via `::highlight(name)`, and
  use the `priority` property so the active range wins.
- Style with `background-color` tint only (low-opacity `--accent`, stronger
  for the open thread). Do **not** rely on `text-decoration` — Firefox does
  not support it inside `::highlight()`. Must be visible in both themes
  (`[data-theme="dark"]` swaps `--accent`).
- Ranges are live but break when nodes move: re-resolve and repaint all
  highlights whenever the 64em `matchMedia` listener re-homes sidenotes
  (hook the same breakpoint change `setupSidenotes()` listens to; do not
  paint once at load only).

## API (Worker)

All endpoints JSON; CORS `Access-Control-Allow-Origin: https://david-bloom.com`
(plus `http://localhost:4321` in dev via env var). The Worker must answer
`OPTIONS` preflights (POST/DELETE with `Content-Type: application/json` and
`Authorization` always preflight): allow methods `GET, POST, DELETE, OPTIONS`,
headers `Content-Type, Authorization`, with a long `Access-Control-Max-Age`.

| Method & path | Auth | Purpose |
| --- | --- | --- |
| `GET /v1/comments?post=<slug>` | none | Visible comments + numbers for a post |
| `POST /v1/comments` | none | Create comment or reply |
| `POST /v1/author/login` | passphrase | Verify passphrase, returns ok (client then stores it) |
| `DELETE /v1/comments/:id` | passphrase header | Soft-delete a comment (or whole thread via `?thread=1`) |
| `POST /v1/comments/:id/hide` | passphrase header | Set `hidden = 1` on a thread |
| `POST /v1/comments/:id/unhide` | passphrase header | Set `hidden = 0` |

- `<slug>` must match `[a-z0-9-]{1,128}`; reject anything else with 400.
- `POST /v1/comments` body: `{ post, parentId?, anchor?, body, name?, commenterKey, author? }`.
  `anchor` required iff `parentId` absent. If `author: true`, the passphrase
  header must validate, else 401. Server escapes nothing — it stores raw text;
  **the client renders all user content (body, name, orphaned `exact`
  snippets) via `textContent`, never `innerHTML`**.
- Replying to a `deleted` comment → 404; replying to a `hidden` comment → 403
  (the client never offers a reply box on hidden threads anyway).
- `GET` response: ordered by `created_at`, hard-capped at 500 comments per
  post in v1 (response includes `truncated: true` past the cap; revisit
  pagination if any post approaches it). `deleted` rows are excluded, except
  a deleted comment with non-deleted descendants returns a tombstone
  (`{ id, parentId, deleted: true }`) so threads don’t lose their structure.
  `hidden` top-level comments return a stub (`{ id, hidden: true }` — no
  anchor, no body) so the client can show “thread hidden by author” in the
  list; hidden threads get no highlight painted.
- Passphrase: stored as a Worker secret (`AUTHOR_PASSPHRASE` via
  `wrangler secret put`), compared constant-time. Sent as
  `Authorization: Bearer`. No sessions/JWT — single user, low stakes.
  `POST /v1/author/login` is rate-limited like comment creation to slow
  brute-forcing.

### Rate limiting & abuse controls

- **Per-minute**: the Workers **`ratelimits` binding** (GA since 2025-09,
  available on the free plan; requires Wrangler ≥ 4.36.0). Configure
  `{ limit: 5, period: 60 }` keyed on client IP. Note its `period` only
  supports 10 or 60 seconds and counters are per-Cloudflare-location, not
  global — fine at these stakes.
- **Per-day** (50/day): the binding can’t do daily windows, so count rows in
  D1: `SELECT COUNT(*) FROM comments WHERE ip_hash = ? AND created_at > <24h ago>`
  before insert. This is why `ip_hash` is on the table.
- `ip_hash` = HMAC-SHA-256 of the connecting IP with a secret key
  (`IP_HASH_KEY`, a Worker secret); raw IPs are never written to D1.
- Body ≤ 4000 chars, name ≤ 40 chars, anchor `exact` ≤ 1000 chars,
  prefix/suffix ≤ 64 chars each; reject request bodies over 16 KB early
  (`Content-Length` cap) and over-limit fields with 400.
- A hidden honeypot field in the form; bots that fill it get a plausible 200
  but the comment is dropped.

### Email notification

On each successful `POST /v1/comments` (non-author), the Worker emails David
the post, a snippet, name/#N, and a direct link
(`https://david-bloom.com/essays/<slug>/#comment-<id>`).

**Provider: Resend** (decided). MailChannels’ free Workers integration was
shut down in mid-2024, and Cloudflare’s docs now point Workers users at
Resend. Free tier: 3,000 emails/month, 100/day, one verified sending domain —
comfortably above the comment rate caps. Verify `david-bloom.com` in Resend
(DNS records added in the same Cloudflare zone), send from e.g.
`comments@david-bloom.com` to David’s Gmail, API key as Worker secret
`RESEND_API_KEY`. Send via `ctx.waitUntil()` after responding — a send
failure must never fail the comment POST.

## Frontend behaviour

A single module, e.g. `src/scripts/annotations.js`, included from
`BlogPost.astro`. It must not interfere with `setupSidenotes()` or the TOC
script, and all `localStorage` access is wrapped in try/catch in its own IIFE
(repo rule: one feature’s init failure must not take down another’s).

### Reading

1. On load, fetch comments for the post (single GET, no client SDK).
2. Re-anchor each top-level comment; paint highlights via Custom Highlight
   API; repaint on the 64em breakpoint change (see Rendering highlights).
3. Clicking/tapping a highlight scrolls to and focuses its margin card
   (bottom sheet on mobile); hovering/focusing a card brightens its highlight.
4. **Global toggle**: a sticky button in the bottom-left corner, styled as the
   mirror of the Subscribe button (bottom-right), labelled “Comments: on” /
   “Comments: off” (may include the count, e.g. “Comments (3): on”). Default
   is **on**. Off removes all comment UI — cards, highlights, and the
   selection toolbar — so the page looks exactly as it does without the
   comments feature; only the toggle button itself remains. The word “hide”
   is reserved for the per-thread control below. State in `localStorage`
   (`annotations:enabled`, default on).
5. **Per-thread collapse**: each card’s “hide” control collapses the thread to
   a compact one-line box in the margin, visually akin to a truncated sidenote
   (e.g. “#2 · 3 comments”, in `--font-ui` small type), expandable by click.
   Threads are expanded by default; collapsed state is stored per-thread in
   `localStorage`. This is the reader-local control, distinct from the
   author’s server-side `hidden` (whose stub renders as a non-expandable
   “thread hidden by author” box in the same collapsed style).

### Writing

1. Reader selects text in `.prose` → small floating “💬 Comment” button appears
   near the selection (mouseup/selectionchange; also works for touch via
   `selectionchange` debounce).
2. Clicking it opens a compose box: textarea + optional “Name” field
   (placeholder “anonymous — shown as #N”) + Post button. Esc/click-away
   closes it, but typed draft text is kept until page unload (click-away
   must not destroy a half-written comment).
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

### Layout (margin cards — decided)

- Top-level threads render as cards in the right margin column, vertically
  aligned with their highlights, interleaved with sidenotes in one
  sorted-by-anchor-position layout pass that extends the stacking algorithm of
  `positionSidenotes()` (this is the main extra layout complexity).
- **Sidenotes keep priority and must stay readable.** Concretely: sidenotes
  are positioned first at their preferred offsets; comment cards then fill the
  gaps, pushed down (never up) past any sidenote they would overlap, with a
  clear gap (≥ 12px, matching the sidenote stacking gap). Cards must be
  visually distinct from sidenotes so the margin doesn’t read as one
  undifferentiated column: cards get a border, background (`--bg` with
  shadow/border vs. the sidenotes’ borderless text), and `--font-ui` chrome;
  sidenote typography is untouched. If a stretch of margin is crowded with
  sidenotes, the affected threads render collapsed (the per-thread compact
  box) rather than pushing sidenotes far from their references.
- Orphaned comments (anchor no longer matches) stack at the end of the margin
  column under a small “on changed text” label.
- On mobile (<64em) the margin doesn’t exist: highlights remain, and tapping
  one opens the thread in a bottom sheet (see mockup); the global toggle
  button behaves identically.

## Repo & deployment changes

- New: `worker/` directory in this repo (or sibling repo — prefer same repo,
  `worker/` with its own `wrangler.jsonc` (current default config format; the
  stable `ratelimits` binding key needs Wrangler ≥ 4.36.0), so the spec,
  site, and API version together). Deployed manually via `npx wrangler
  deploy` at first; a GitHub Action later if it churns.
- DNS: `api.david-bloom.com` routed to the Worker (Cloudflare-proxied, unlike
  the site’s DNS-only records).
- D1 database via `wrangler d1 create comments`; schema applied with
  `wrangler d1 execute comments --remote --file schema.sql` (`--local` for
  dev — the flag is required either way).
- Secrets: `wrangler secret put AUTHOR_PASSPHRASE`, `RESEND_API_KEY`,
  `IP_HASH_KEY`.
- D1 free-tier headroom (verified): 5M rows read / 100K rows written per day.
  Worst plausible case (every page view reads a few hundred comment rows,
  dozens of comments/day written) is orders of magnitude inside both; the
  500-comment GET cap also bounds reads per view.
- Site: `src/scripts/annotations.js` (+ CSS, either in the layout or a small
  stylesheet), loaded only on essay pages, deferred, and a no-op if the API is
  unreachable (the essay must never break because the Worker is down).

## Verification plan

- Unit-ish: Worker tested locally with `wrangler dev` + `curl` (create, reply,
  reply-to-deleted/hidden, rate-limit trip, author auth fail/success,
  hide/delete, tombstone shape, OPTIONS preflight headers).
- Browser: Playwright against `npx astro preview` at 1440px and 390px —
  select→comment flow, per-thread collapse/expand round-trip, “Comments: off”
  leaves the page pristine (no cards, highlights, or toolbar), comment cards
  never overlap sidenotes on a sidenote-heavy page
  (`grounding-of-zetetic-norms`), dark mode highlight contrast, and
  highlights surviving a resize across the 64em breakpoint with comments open
  (sidenotes re-home; highlights must repaint).
- Anchoring: a comment created at 390px (sidenotes inline) must resolve at
  1440px (sidenotes in margin), and vice versa; a selection adjacent to a
  KaTeX formula must round-trip.
- Orphaning: edit a fixture post’s paragraph and confirm the comment degrades
  to the orphan list rather than mis-anchoring.

## Open questions

None — placement (margin cards), visibility model (default on, sticky
bottom-left “comments on/off” button, per-thread “hide” collapses to an
expandable box) were decided with David on 2026-06-10.

## References

- [CSS Custom Highlight API — MDN](https://developer.mozilla.org/en-US/docs/Web/API/CSS_Custom_Highlight_API) and [caniuse: Highlight API](https://caniuse.com/mdn-api_highlight) — Chrome 105+, Safari 17.2+, Firefox 140+; Firefox lacks `text-decoration` in `::highlight()`.
- [Workers rate limiting binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/) and [GA changelog (2025-09-19)](https://developers.cloudflare.com/changelog/post/2025-09-19-ratelimit-workers-ga/) — `period` ∈ {10, 60}s, per-location counters.
- [D1 limits](https://developers.cloudflare.com/d1/platform/limits/) — free tier: 5M rows read/day, 100K rows written/day.
- [MailChannels Workers EOL notice](https://support.mailchannels.com/hc/en-us/articles/26814255454093-End-of-Life-Notice-Cloudflare-Workers) and [Resend pricing](https://resend.com/pricing) — free: 3,000/month, 100/day, 1 verified domain.
- [W3C Web Annotation Data Model §4.2.3 TextQuoteSelector](https://www.w3.org/TR/annotation-model/#text-quote-selector) — `exact` required, `prefix`/`suffix` optional.
- [Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/) and [D1 Wrangler commands](https://developers.cloudflare.com/d1/wrangler-commands/) — `wrangler.jsonc` default; `d1 execute` needs `--local`/`--remote`.
