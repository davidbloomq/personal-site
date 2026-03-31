# Personal Site Redesign — Design Spec

## Overview

Systematic revision of david-bloom.com addressing readability, layout, and component quality. The site keeps its current stack (Astro + GitHub Pages) and visual identity (Newsreader + Inter, rust accent, warm off-white background). Changes target typography, layout structure, and component implementations.

Inspirations: joecarlsmith.com (essay layout, sidenotes, TOC, subscribe modal) and jfriedmanphilo.github.io (homepage vertical centering, minimalism).

## 1. Homepage Layout

**Current:** 3-column grid pinned to the top of the viewport with large empty space below.

**Change:** Vertically center the `.page-grid` in the viewport (Friedman-style). Use `min-height: 100vh` with flexbox centering on the body/wrapper. As the essay list grows and exceeds viewport height, the page scrolls naturally — no special handling needed.

Remove the Footer component entirely (copyright line) from both the homepage and essay pages. Delete `Footer.astro` and all imports.

## 2. Typography

**Current:** `0.875rem` (14px) body, `line-height: 1.35`.

**Change:**
- Body text: `1rem` (16px), `line-height: 1.6`
- Content column width: apply `max-width: 640px` on the `.prose` element (not the grid track — the track stays `1fr`, prose is naturally left-aligned within it). Also update `.prose`'s scoped `line-height` from `1.35` to `1.6` to match the new body value.
- Headings: keep current absolute `rem` values (`--font-size-h1: 2.5rem`, `--font-size-h2: 1.8rem`, `--font-size-h3: 1.5rem`). The ratios to body text will shrink slightly, which is fine — the current values already look good at 1rem body.
- Blockquotes: reduce from `1.25rem` to `1.125rem` to maintain a similar ratio to the new body size
- UI text (dates, TOC, links labels): keep at smaller sizes (`0.75rem` / `0.8rem`)

## 3. Essay Layout — CSS Grid Rewrite

**Current:** Grid with float-based sidenotes that use negative margins to escape their container. Sidenotes can overlap.

**Change:** Rewrite `BlogPost.astro` to use a proper 3-column CSS Grid where sidenotes occupy their own grid track:

```
Desktop (≥64em):
[TOC 220px] [gap] [content 1fr] [gap] [sidenotes 220px]
```

### Sidenote DOM Strategy

Sidenotes are rendered inline within the prose (inside Markdown/MDX content), so they can't directly participate in the parent grid. The solution: a script in `BlogPost.astro` that runs after render and **moves sidenote DOM nodes** from inside `.prose` into a dedicated `<div class="sidenote-column">` in the grid's third track. This is the same approach Carlsmith uses.

Steps:
1. Add an empty `<div class="sidenote-column" id="sidenote-column"></div>` as a sibling of `.essay-body` in the grid
2. On page load, `querySelectorAll('.sidenote')` inside `.prose`, and `appendChild` each into `#sidenote-column`
3. The superscript number label stays inline in the prose; only the sidenote body moves
4. Sidenotes stack naturally in the column — no overlap possible

### Sidenote Component Changes

`Sidenote.astro` markup splits into two parts:
- **Inline reference:** superscript number + checkbox (stays in prose flow)
- **Sidenote body:** `.sidenote` span with content + "More" button (gets moved by script)

The component renders both inline. The script separates them. The DOM-mover script checks `window.matchMedia('(min-width: 64em)')` before running. On mobile, it does not execute — sidenotes stay inline as checkbox-toggled siblings (existing behavior). A `matchMedia` listener re-runs the logic on resize/orientation change.

Keep the truncation/expand behavior (JS in BlogPost layout).

### Responsive Behavior

Consolidate breakpoints: use `64em` as the single desktop/mobile breakpoint throughout. The existing `720px` breakpoint in `global.css` for font size reduction stays as a secondary mobile refinement.

## 4. Table of Contents — Nested Numbering

**Current:** Flat list of h2/h3, h3 indented with `padding-left: 16px`. No numbering, no deeper nesting.

**Change:** Support h2, h3, h4 with auto-numbering and nesting.

### HTML Structure

Generate nested `<ol>` elements (not a flat list with CSS counters):

```html
<ol>
  <li><a href="#s1">1. Introduction</a> ›</li>
  <li>
    <a href="#s2">2. Philosophy as a tool</a> ›
    <ol>
      <li><a href="#s2-1">2.1 Sub-section</a> ›</li>
      <li>
        <a href="#s2-2">2.2 Another sub-section</a> ›
        <ol>
          <li><a href="#s2-2-1">2.2.1 Deep section</a> ›</li>
        </ol>
      </li>
    </ol>
  </li>
</ol>
```

### Numbering Logic

The `buildTOC()` function maintains counters:
- h2 increments the top-level counter, resets h3/h4 counters
- h3 increments the second-level counter, resets h4 counter
- h4 increments the third-level counter

Each heading gets its number prepended in the TOC link text (not in the heading itself).

### Styling

- Each nested `<ol>` indented with `padding-left: 1em`
- Small arrow chevron (CSS `›` or border-based) after each link
- Active link: accent color. Inactive: `--text-light`
- Scrollspy via IntersectionObserver at all three levels

## 5. Subscribe Modal

**Current:** `<button>` with `onclick="window.location.href='/rss.xml'"` — wrong semantics, no modal.

**Change:** Replace with an `<a>` element styled as a button, fixed bottom-right (same position). Clicking opens a small modal overlay with:
- "Subscribe" heading
- RSS link (`/rss.xml`)
- Substack link (placeholder `#` for now)
- Close button (× in top-right corner) + click-outside-to-close

Modal: white background, subtle box-shadow, compact size (~250px wide), appears anchored near the button (bottom-right area). Semi-transparent backdrop. Pure HTML/CSS/vanilla JS.

**Scope:** The subscribe button appears on essay pages only (in `BlogPost.astro`), not the homepage. The homepage already has RSS/Substack in the links column.

## 6. Self-Host Fonts

**Current:** Google Fonts link in `BaseHead.astro` for Inter + Newsreader. Unused Atkinson WOFF files in `public/fonts/`.

**Change:**
- Download Inter and Newsreader as WOFF2 files into `public/fonts/`
- Add `@font-face` declarations in `global.css` with `font-display: swap`
- Remove the Google Fonts `<link>` from `BaseHead.astro`
- Delete unused `atkinson-bold.woff` and `atkinson-regular.woff`

Font weights to include:
- Inter: 300, 400, 500 (drop 600 — unused in current CSS)
- Newsreader: 300, 400, 500 (roman + italic, optical size range)

## 7. Small Fixes

- **`pre > code` reset:** Replace `all: unset` with targeted overrides (`background: none; padding: 0; border-radius: 0`).
- **Footer removal:** Delete `Footer.astro` component and all imports/usages in `BlogPost.astro` and `index.astro`.
- **`.superpowers/` in `.gitignore`:** Add if not present.

## Files Changed

| File | Action |
|------|--------|
| `src/styles/global.css` | Typography updates, `@font-face` declarations, fix `pre > code`, blockquote size |
| `src/layouts/BlogPost.astro` | Grid rewrite, sidenote DOM mover, TOC rewrite, subscribe modal, remove Footer |
| `src/pages/index.astro` | Vertical centering, remove Footer |
| `src/components/Sidenote.astro` | Remove float CSS, split into inline-ref + sidenote-body |
| `src/components/BaseHead.astro` | Remove Google Fonts link |
| `src/components/Footer.astro` | Delete |
| `public/fonts/` | Add Inter + Newsreader WOFF2, delete Atkinson files |
| `.gitignore` | Add `.superpowers/` |

## Out of Scope

- KaTeX loading optimization (keeping it global)
- Date format changes (keeping MM.DD.YYYY)
- OG image generation
- Substack/RSS URL population (placeholders stay)
- Dark mode
- New pages or content
- `Header.astro` changes (no modifications needed)
