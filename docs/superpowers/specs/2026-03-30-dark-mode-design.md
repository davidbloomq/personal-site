# Dark Mode — Design Spec

## Overview

Add dark mode to david-bloom.com. Defaults to OS preference (`prefers-color-scheme`), with a manual toggle that persists in `localStorage`. Warm charcoal palette that matches the existing light theme's warmth.

## Palette

`[data-theme="dark"]` overrides for the existing `:root` CSS custom properties:

| Variable | Light (current) | Dark |
|---|---|---|
| `--text` | `#000000` | `#e8e2dc` |
| `--text-muted` | `#23222180` | `#a89f9480` |
| `--text-light` | `#23222166` | `#a89f9466` |
| `--accent` | `#C46157` | `#D4776E` |
| `--accent-hover` | `#a84e45` | `#e08d85` |
| `--bg` | `#faf8f8` | `#1a1817` |
| `--bg-alt` | `#f1efef` | `#242120` |
| `--border` | `#23222140` | `#e8e2dc25` |

## Theme Initialization

An inline `<script>` in `BaseHead.astro`, placed in `<head>` so it executes before first paint:

1. Read `localStorage.getItem('theme')`
2. If no stored value, check `window.matchMedia('(prefers-color-scheme: dark)').matches`
3. Set `document.documentElement.dataset.theme` to `'light'` or `'dark'`

This prevents flash of the wrong theme (FOUC).

## Toggle

A filled circle (`●`) in the header navigation area. Dark dot on light background, light dot on dark background. Styled to match the nav link size and `--text-muted` color.

On click:
1. Flip `data-theme` on `<html>`
2. Store new value in `localStorage`

**Essay pages:** Toggle goes in `Header.astro`, after the nav links.

**Homepage:** Toggle goes inside the `.home-header` grid area, right-aligned (e.g. `flex` with `justify-content: space-between`). The homepage doesn't use `Header.astro`, so the toggle is added directly to `index.astro`.

## AsciiCursorTrail

Currently hardcodes `const accentColor = [196, 97, 87]`. Change to:

1. Read `--accent` from `getComputedStyle(document.documentElement)` at init
2. Re-read when theme changes (listen for `data-theme` attribute mutation via `MutationObserver`)
3. Parse hex to RGB for use in canvas `fillStyle`

The trail color matches the current theme's accent.

## Subscribe Modal (BlogPost.astro)

Replace hardcoded colors with theme variables:

- `.subscribe-modal-content` `background: #fff` → `background: var(--bg)`
- `.subscribe-backdrop` `background: rgba(0, 0, 0, 0.2)` → `background: rgba(0, 0, 0, 0.4)` (works for both themes; slightly darker overlay for dark mode readability)
- `.subscribe-modal-content` `box-shadow` — increase opacity in dark mode so it remains visible against the dark background

## Files Changed

| File | Change |
|---|---|
| `src/styles/global.css` | Add `[data-theme="dark"]` variable overrides |
| `src/components/BaseHead.astro` | Add inline theme init script in `<head>` |
| `src/components/Header.astro` | Add `●` toggle button + click handler |
| `src/pages/index.astro` | Add `●` toggle to homepage |
| `src/components/AsciiCursorTrail.astro` | Read `--accent` dynamically, listen for theme changes |
| `src/layouts/BlogPost.astro` | Replace hardcoded modal colors with CSS variables |

No new files created. No new dependencies.
