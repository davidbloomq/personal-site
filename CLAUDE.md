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
- `src/components/` — Sidenote, Header (w/ nav + dark mode toggle), BaseHead (+ theme init script), FormattedDate, Definition, AsciiCursorTrail (reads `--accent` dynamically)
- `src/content/blog/` — essay markdown/MDX files

## Writing

- `.md` for plain essays, `.mdx` for essays with sidenotes
- Sidenotes: import `Sidenote.astro`, use `<Sidenote id={N}>text</Sidenote>`
- Frontmatter: `title`, `description`, `pubDate`, optional `updatedDate`

## Deployment

GitHub repo: `davidbloomq/personal-site` (public). Pushes to `main` auto-deploy via `.github/workflows/deploy.yml` → GitHub Pages. Custom domain `david-bloom.com` via Cloudflare DNS (A records + CNAME, DNS-only/gray cloud).

## Dev

- `npm run dev` — localhost:4321
- `npx astro build` — build to `dist/`
