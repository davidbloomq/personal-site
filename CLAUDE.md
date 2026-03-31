# Personal Site

Personal blog at david-bloom.com. Astro static site deployed to GitHub Pages via Cloudflare.

## Stack

Astro, KaTeX (remark-math + rehype-katex), vanilla CSS. Design tokens in `src/styles/global.css :root`.

## Structure

- `src/styles/global.css` — CSS variables and base styles
- `src/layouts/BlogPost.astro` — essay layout (3-col: TOC | content | sidenotes)
- `src/pages/index.astro` — homepage (2-col desktop: bio+essays | links; single-col mobile)
- `src/pages/essays/[...slug].astro` — essay routes
- `src/pages/rss.xml.js` — RSS feed (styled via `public/rss.xsl`)
- `src/components/` — Sidenote, Header (w/ nav), BaseHead, FormattedDate, Definition
- `src/content/blog/` — essay markdown/MDX files

## Writing

- `.md` for plain essays, `.mdx` for essays with sidenotes
- Sidenotes: import `Sidenote.astro`, use `<Sidenote id={N}>text</Sidenote>`
- Frontmatter: `title`, `description`, `pubDate`, optional `updatedDate`

## Dev

- `npm run dev` — localhost:4321
- `npx astro build` — build to `dist/`
