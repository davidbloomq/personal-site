# personal-site

David Bloom's personal blog at [david-bloom.com](https://david-bloom.com). A static [Astro](https://astro.build) site deployed to GitHub Pages, fronted by Cloudflare DNS.

## Working on this repo

- `CLAUDE.md` — the canonical guide: stack, structure, writing conventions, deployment, and hard-won gotchas. Read it first (agents and humans alike).
- `specs/` — implementation-ready specs for features that have been designed but not yet built. Each spec is self-contained: decisions already made with David are marked final.
- `later.md` — raw feature ideas not yet designed.

## Commands

| Command | Action |
| :-- | :-- |
| `npm install` | Install dependencies (required before first build in a fresh checkout) |
| `npm run dev` | Dev server at `localhost:4321` |
| `npx astro build` | Build to `./dist/` |
| `npx astro preview` | Serve the built site locally |

## Deployment

Pushes to `main` auto-deploy via `.github/workflows/deploy.yml` → GitHub Pages. Nothing on a feature branch is visible on david-bloom.com.
