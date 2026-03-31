# Site Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve typography hierarchy, essay reading experience, sidenote robustness, and structural completeness (nav) — without adding complexity, brittleness, or ongoing content management burden.

**Architecture:** Pure CSS changes for typography and layout. Minor structural additions to existing layouts. No new JS, no new dependencies, no categories or series system. Sidenote JS is simplified (remove the move-on-resize dance) but keeps the single-element approach since Astro `<slot />` only renders once. No footer — the fixed subscribe button already covers that role.

**Tech Stack:** Astro, vanilla CSS, existing Newsreader + Inter fonts.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/styles/global.css` | Modify | Typography hierarchy changes (heading weights, sizes, blockquote styling) |
| `src/layouts/BlogPost.astro` | Modify | Simplify sidenote JS (remove resize DOM-move) |
| `src/components/Header.astro` | Modify | Add nav link to homepage |
| `src/pages/index.astro` | Modify | Add description lines to essay list |

---

### Task 1: Typography hierarchy in global.css

Improve heading differentiation using weight and size variation, and upgrade blockquote styling. No color changes.

**Files:**
- Modify: `src/styles/global.css:99-155`

- [ ] **Step 1: Update heading styles**

Change h1 to weight 300 (lighter, more elegant at large sizes). Change h2 to weight 300. Switch h3 to Inter (sans) with weight 500 and uppercase letter-spacing, creating a clear visual break from h1/h2 without relying only on size. No italic — Inter italic font-face isn't loaded and faux italic looks bad on geometric sans-serifs.

```css
h1 {
	font-size: var(--font-size-h1);
	font-weight: 300;
	margin: 0 0 0.5em;
}

h2 {
	font-size: var(--font-size-h2);
	font-weight: 300;
	margin: 2em 0 0.5em;
}

h3 {
	font-family: var(--font-ui);
	font-size: 0.85rem;
	font-weight: 500;
	text-transform: uppercase;
	letter-spacing: 0.06em;
	margin: 1.5em 0 0.5em;
}

h4, h5, h6 {
	font-family: var(--font-ui);
	font-size: 0.8rem;
	font-weight: 500;
	text-transform: uppercase;
	letter-spacing: 0.06em;
	margin: 1.5em 0 0.5em;
}
```

- [ ] **Step 2: Update blockquote styles**

Replace the left-border blockquote with a more typographic treatment: larger italic serif text, no background fill, subtle left padding.

```css
blockquote {
	margin: 1.5em 0;
	padding: 0 0 0 1.5em;
	font-size: 1.05rem;
	font-weight: 300;
	font-style: italic;
	color: var(--text);
	border-left: 2px solid var(--border);
	background: none;
	border-radius: 0;
}

blockquote::before {
	content: none;
}
```

- [ ] **Step 3: Verify in browser**

Run: `npm run dev` (if not already running)
Open `http://localhost:4321/essays/grounding-of-zetetic-norms/`
Expected: h1 appears lighter (300 weight). h2 is lighter. h3 switches to Inter uppercase small text. Blockquotes are italic serif without background fill.

- [ ] **Step 4: Commit**

```bash
git add src/styles/global.css
git commit -m "typography: lighter headings, Inter h3, cleaner blockquotes"
```

---

### Task 2: Simplify sidenote JS (remove resize DOM-moving)

The current JS moves sidenote DOM elements between the prose and the sidenote column on every resize crossing the 64em breakpoint (`moveSidenotesToColumn` / `moveSidenotesBack`). This is the most fragile code on the site. Simplify: move sidenotes to the column once on load, and let CSS handle hiding the column on mobile (the checkbox toggle already works for inline display on mobile since the sidenote markup stays in the prose as well — the move just copies it).

**Note:** Astro `<slot />` renders once, so we can't dual-render the sidenote. We keep the single-element approach but simplify the JS to a one-time move + resize repositioning (no DOM-moving back and forth).

**Files:**
- Modify: `src/layouts/BlogPost.astro:156-258` (the `<script>` block)

- [ ] **Step 1: Simplify the setupSidenotes() function in BlogPost.astro**

Find and replace the entire `setupSidenotes()` function (lines ~156-258 in the script block). The new version:
- Moves sidenotes to the column once on load (if desktop)
- Positions them with absolute offsets (same as before)
- Sets up truncation (same as before)
- On resize, only repositions — never moves elements back to prose
- Mobile users who resize to desktop get a page reload for sidenotes (acceptable tradeoff vs. the DOM-move complexity)

```javascript
function setupSidenotes() {
  const TRUNCATE_HEIGHT = 96;
  const prose = document.querySelector('.prose');
  const column = document.getElementById('sidenote-column');
  if (!prose || !column) return;

  const isDesktop = window.matchMedia('(min-width: 64em)').matches;
  if (!isDesktop) return; // On mobile, sidenotes stay inline, toggled by checkbox CSS

  // Move sidenotes to column (one-time)
  const notes = prose.querySelectorAll('.sidenote');
  notes.forEach((note) => {
    column.appendChild(note);
    note.style.display = 'block';
    note.style.position = 'absolute';
    note.style.width = '100%';
  });

  function positionSidenotes() {
    const gridRect = document.querySelector('.essay-grid')?.getBoundingClientRect();
    const colRect = column.getBoundingClientRect();
    if (!gridRect) return;
    const colOffsetTop = colRect.top - gridRect.top;
    let lastBottom = 0;

    notes.forEach((note) => {
      const id = note.getAttribute('data-sidenote-id');
      const ref = document.querySelector(`label[for="sn-${id}"]`);
      if (!ref) return;

      const refRect = ref.getBoundingClientRect();
      let targetTop = (refRect.top - gridRect.top) - colOffsetTop;
      if (targetTop < lastBottom) targetTop = lastBottom;

      note.style.top = targetTop + 'px';
      lastBottom = targetTop + note.offsetHeight + 12;
    });
  }

  // Truncation
  requestAnimationFrame(() => {
    notes.forEach((note) => {
      const content = note.querySelector('.sidenote-content');
      const btn = note.querySelector('.sidenote-more');
      if (!content || !btn) return;

      if (content.scrollHeight > TRUNCATE_HEIGHT) {
        note.classList.add('truncated');
        btn.classList.add('visible');
        btn.textContent = 'MORE \u2304';
        btn.addEventListener('click', () => {
          const isTruncated = note.classList.contains('truncated');
          if (isTruncated) {
            note.classList.remove('truncated');
            btn.textContent = 'LESS \u2303';
          } else {
            note.classList.add('truncated');
            btn.textContent = 'MORE \u2304';
          }
          requestAnimationFrame(() => positionSidenotes());
        });
      }
    });
    positionSidenotes();
  });

  // Reposition on resize (cheap — just recalculates offsets, no DOM moves)
  window.addEventListener('resize', () => requestAnimationFrame(() => positionSidenotes()));
}
```

- [ ] **Step 2: Verify sidenotes work on desktop and mobile**

Open `http://localhost:4321/essays/sample-essay/`
Desktop (wide window): sidenotes appear in right column, aligned to their reference numbers. Truncation and MORE/LESS toggle work.
Mobile (narrow window or DevTools responsive): sidenotes are hidden by default, clicking the superscript number toggles them inline.

- [ ] **Step 3: Commit**

```bash
git add src/layouts/BlogPost.astro
git commit -m "sidenotes: simplify JS, remove resize DOM-move dance"
```

---

### Task 3: Add nav to essay header

**Files:**
- Modify: `src/components/Header.astro`

- [ ] **Step 1: Add nav link to Header.astro**

Add an "Essays" link to the header so readers can navigate back to the essay list.

Replace the full content of `src/components/Header.astro`:

```astro
<header>
  <a href="/" class="site-name">David Bloom</a>
  <nav class="site-nav">
    <a href="/">Essays</a>
  </nav>
</header>
<style>
  header {
    padding: 1.5em 0 0.5em;
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }
  .site-name {
    font-family: var(--font-ui);
    font-size: 1.3em;
    font-weight: 600;
    color: var(--text);
    text-decoration: none;
  }
  .site-name:hover {
    color: var(--accent);
    text-decoration: none;
  }
  .site-nav {
    display: flex;
    gap: 1.25em;
    font-family: var(--font-ui);
    font-size: var(--font-size-ui);
  }
  .site-nav a {
    color: var(--text-muted);
    text-decoration: none;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-weight: 500;
  }
  .site-nav a:hover {
    color: var(--accent);
  }
</style>
```

- [ ] **Step 2: Verify header nav on essay page**

Open `http://localhost:4321/essays/sample-essay/`
Expected: Header shows "David Bloom" on left, "Essays" link on right.

- [ ] **Step 3: Commit**

```bash
git add src/components/Header.astro
git commit -m "feat: add Essays nav link to header"
```

---

### Task 4: Add descriptions to homepage essay list

**Files:**
- Modify: `src/pages/index.astro`

- [ ] **Step 1: Add description lines to essay entries**

In `src/pages/index.astro`, find the essay list rendering:

```astro
{posts.map((post) => (
  <li>
    <FormattedDate date={post.data.pubDate} />
    <a href={`/essays/${post.id}/`}>{post.data.title}</a>
  </li>
))}
```

Replace with:

```astro
{posts.map((post) => (
  <li>
    <FormattedDate date={post.data.pubDate} />
    <a href={`/essays/${post.id}/`}>{post.data.title}</a>
    <p class="home-essay-desc">{post.data.description}</p>
  </li>
))}
```

- [ ] **Step 2: Add CSS for the description**

In the `<style>` block of `index.astro`, add after the `.home-essay-list li a:hover` rule:

```css
.home-essay-desc {
  font-family: var(--font-body);
  font-size: 0.9rem;
  font-weight: 300;
  color: var(--text-muted);
  line-height: 1.45;
  margin: 0.2em 0 0;
}
```

- [ ] **Step 3: Verify homepage**

Open `http://localhost:4321/`
Expected: Each essay shows date, title, and description beneath it.

- [ ] **Step 4: Commit**

```bash
git add src/pages/index.astro
git commit -m "homepage: add essay descriptions"
```

---

### Task 5: Switch essay grid to proportional columns

The current essay layout uses fixed `220px` side columns. Switch the main column to a fractional unit so it breathes on wider screens, matching Carlsmith's approach.

**Files:**
- Modify: `src/layouts/BlogPost.astro:289-311` (the CSS grid definition)

- [ ] **Step 1: Update grid-template-columns**

In the desktop media query for `.essay-grid`, find:

```css
grid-template-columns: var(--side-col) 1fr var(--side-col);
```

Replace with:

```css
grid-template-columns: var(--side-col) minmax(0, 720px) var(--side-col);
```

Also remove the `max-width: 640px` from `.prose` since the grid column now controls width:

Find:
```css
.prose {
  line-height: 1.6;
  font-size: 1rem;
  max-width: 640px;
}
```

Replace with:
```css
.prose {
  line-height: 1.6;
  font-size: 1rem;
}
```

- [ ] **Step 2: Verify essay page layout**

Open `http://localhost:4321/essays/grounding-of-zetetic-norms/`
Expected: Main content column is wider (up to 720px), fills available space. Side columns remain 220px. Layout still centers.

- [ ] **Step 3: Commit**

```bash
git add src/layouts/BlogPost.astro
git commit -m "essay layout: proportional main column, remove prose max-width"
```

---

### Task 6: Final build verification

- [ ] **Step 1: Run production build**

Run: `npx astro build`
Expected: Build completes with no errors.

- [ ] **Step 2: Preview production build**

Run: `npx astro preview`
Open `http://localhost:4321/`
Verify: Homepage renders with descriptions. Click through to an essay — verify headings, sidenotes, blockquotes, and header nav all work.

- [ ] **Step 3: Commit any final fixes if needed**
