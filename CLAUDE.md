# Personal Site

Personal blog at david-bloom.com. Astro static site deployed to GitHub Pages via Cloudflare.

## Stack

Astro, KaTeX (remark-math + rehype-katex), vanilla CSS. Design tokens in `src/styles/global.css :root`. Dark mode via `[data-theme="dark"]` CSS overrides + localStorage toggle.

## Structure

- `src/styles/global.css` — CSS variables and base styles
- `src/layouts/BlogPost.astro` — essay layout (3-col: TOC | content | sidenotes)
- `src/pages/index.astro` — homepage (2-col desktop: bio+essays | links; single-col mobile)
- `src/pages/essays/[...slug].astro` — essay routes
- `src/pages/rss.xml.js` — RSS feed XML (feed readers consume this directly)
- `src/pages/feed.astro` — human-readable feed page (XSL redirects browsers here)
- `public/rss.xsl` — XSL redirect from `/rss.xml` to `/feed` for browser visitors
- `src/components/` — Sidenote, Header, ThemeToggle (shared dark-mode toggle used by Header, index, and feed — don't reintroduce inline copies), BaseHead (+ theme init script), FormattedDate (UTC getters on purpose), Definition, AsciiCursorTrail (reads `--accent` dynamically; off by default, toggled by the homepage "fun cursor" button via localStorage `funCursor` + `fun-cursor-change` event)
- `src/content/blog/` — essay markdown/MDX files
- `later.md` — feature ideas not yet designed

## Retired features

- **Annotations** (reader comments anchored to text highlights): fully
  implemented and briefly live on 2026-06-11, then retired the same day at
  David's request — before the Cloudflare side (D1, secrets,
  `api.david-bloom.com`) was ever provisioned, so no production data or
  infrastructure exists. The complete, working, browser-tested implementation
  is preserved on branch **`archive/annotations`**: the spec
  (`specs/annotations.md`, including the late own-comment edit/delete
  decision), Worker + D1 API in `worker/` (own README with the Cloudflare
  setup checklist), frontend `src/scripts/annotations.js` +
  `src/styles/annotations.css`, the shared `src/scripts/margin-layout.js`
  (sidenote-stacking refactor — `main` still uses the original inline
  `positionSidenotes()`), and an `npm run dev:full` local-stack script.
  To restore: `git merge archive/annotations` on a feature branch (expect
  drift in `BlogPost.astro`, `package.json`, `astro.config.mjs`, and this
  file if they've changed since), re-verify per the spec's verification plan,
  then do the Cloudflare provisioning in `worker/README.md`. Don't
  re-implement from scratch — the archived code already handles the hard
  parts: anchors that survive the sidenote re-homing across the 64em
  breakpoint, KaTeX's hidden MathML duplicate, and orphaning when essay
  text changes (all documented in the archived spec).

## Writing

- `.md` for plain essays, `.mdx` for essays with sidenotes
- Sidenotes: import `Sidenote.astro`, use `<Sidenote id={N}>text</Sidenote>`
- Frontmatter: `title`, `description`, `pubDate`, optional `updatedDate`
- The reference post format is `grounding-of-zetetic-norms.mdx`: curly quotes, em dashes, footnotes as sidenotes (not markdown `[^N]` footnotes)
- Links in sidenotes/footnotes must be descriptive hyperlinks ("see [the SEP entry](…)"), never bare URLs — long URLs also break the sidenote column layout
- Don't number headings manually ("1. Mental states") — the TOC script numbers them, producing "1.1 1. …" otherwise
- Homepage, /feed, and RSS all sort by `pubDate` newest-first; a wrong `pubDate` silently buries a post
- When importing a post from Substack: strip the "Thanks for reading… Subscribe" boilerplate and the byline/date lines, and confirm with David which `pubDate` to use (he has chosen today's date over the original Substack date before)

## Deployment

GitHub repo: `davidbloomq/personal-site` (public). Pushes to `main` auto-deploy via `.github/workflows/deploy.yml` → GitHub Pages. Custom domain `david-bloom.com` via Cloudflare DNS (A records + CNAME, DNS-only/gray cloud).

## Dev

- `npm run dev` — localhost:4321
- `npx astro build` — build to `dist/`

## Notes for agents

- Nothing is live until it's on `main`; work pushed only to a feature branch is invisible on david-bloom.com. David has asked "why don't I see it on the site" when work sat on a branch — say explicitly when something is not yet deployed.
- The essay grid in `BlogPost.astro` defines `grid-template-areas` twice (mobile default + ≥64em). Any area used by a child (e.g. `grid-header`) must appear in BOTH templates — a missing area creates phantom implicit columns and once silently crushed mobile essay text to 169px wide.
- Sidenote behavior (margin column vs inline) is set up in `BlogPost.astro`'s `setupSidenotes()` and must keep working when the viewport resizes across the 64em breakpoint — it re-homes the notes on `matchMedia` change; don't regress this to a load-time-only check.
- Wrap all `localStorage` access in try/catch (Safari "Block all cookies" throws), and don't let one feature's init failure share an IIFE with another's.
- A `npx astro build` passing says nothing about layout. For visual changes, verify in a real browser at 1440px and 390px. In the cloud sandbox, Playwright lives at `/opt/node22/lib/node_modules/playwright` (import by absolute path); david-bloom.com itself is NOT reachable from the sandbox network — use `npx astro preview` against the local build.
- Run `npm install` before the first `npx astro build` in a fresh sandbox — without local node_modules the build fails on `@astrojs/mdx`.
- Despite being the reference post format, `grounding-of-zetetic-norms` currently has NO sidenotes — `why-im-a-dualist` is the essay with sidenotes, so use it for any sidenote-layout testing.
