# personal-site

Source for [david-bloom.com](https://david-bloom.com) — David Bloom's personal blog. Essays on philosophy and whatever else.

Astro static site: vanilla CSS, KaTeX for math, MDX sidenotes in the margin, dark mode. No frameworks, no analytics.

## Commands

| Command           | Action                                    |
| :---------------- | :---------------------------------------- |
| `npm install`     | Install dependencies                      |
| `npm run dev`     | Dev server at `localhost:4321`            |
| `npm run build`   | Build to `./dist/`                        |
| `npm run preview` | Preview the production build locally      |

## Deployment

Pushes to `main` auto-deploy to GitHub Pages via `.github/workflows/deploy.yml`; `david-bloom.com` points there through Cloudflare DNS. Nothing is live until it's on `main`.

## More

`CLAUDE.md` is the working documentation: structure, writing conventions, deployment details, and notes (including retired features archived on branches).
