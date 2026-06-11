# Retired features

Features that were fully built and then pulled from the site. Each is
archived on a git branch, working as of the date it was retired. Read the
relevant entry here before re-implementing anything similar from scratch.

## Annotations (reader comments anchored to text highlights)

**Archive branch: `archive/annotations`.** Fully implemented and briefly live
on 2026-06-11, then retired the same day at David's request — before the
Cloudflare side (D1, secrets, `api.david-bloom.com`) was ever provisioned, so
no production data or infrastructure exists.

What it was: readers select essay text and attach comments, Google-Docs
style — threaded replies, optional per-comment names (anonymous commenters
get a stable per-post "#N"), a global on/off toggle, per-thread collapse,
margin cards interleaved with sidenotes (bottom sheet on mobile), author mode
with moderation (delete/hide) behind a passphrase, own-comment edit/delete,
email notification on new comments.

The archive branch contains the complete, browser-tested implementation:

- `specs/annotations.md` — the full spec, including decisions made late
  (own-comment edit/delete superseding the original non-goal; no emoji on the
  selection button) and a verification plan
- `worker/` — Cloudflare Worker + D1 comments API, with its own README
  covering local dev and the one-time Cloudflare provisioning checklist
- `src/scripts/annotations.js` + `src/styles/annotations.css` — the frontend
- `src/scripts/margin-layout.js` — sidenote stacking refactored into a shared
  margin-layout pass (`main` still uses the original inline
  `positionSidenotes()` in `BlogPost.astro`)
- an `npm run dev:full` script that boots site + API together locally,
  and Codespaces preview support

To restore:

1. `git merge archive/annotations` on a feature branch. Expect drift in
   `BlogPost.astro`, `package.json`, `astro.config.mjs`, `CLAUDE.md`, and
   `later.md` if they've changed since the archive date.
2. Re-verify per the spec's verification plan (Playwright at 1440px/390px;
   `why-im-a-dualist` is the sidenote essay).
3. Do the Cloudflare provisioning in `worker/README.md` (needs David's
   account: D1 create + id into `wrangler.jsonc`, secrets, `wrangler deploy`,
   optional Resend domain verification for email).

Don't re-implement from scratch: the archived code already handles the hard
parts — anchors that survive sidenote re-homing across the 64em breakpoint,
KaTeX's hidden MathML duplicate, and graceful orphaning when essay text
changes.
