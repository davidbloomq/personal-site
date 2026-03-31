# Site Redesign Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Revise david-bloom.com for improved readability, proper sidenote layout, nested TOC, and subscribe modal — inspired by joecarlsmith.com and jfriedmanphilo.github.io.

**Architecture:** Static Astro site. Changes are CSS/HTML/vanilla JS only — no new dependencies. Font files self-hosted. Essay layout moves from float-based sidenotes to CSS Grid with DOM relocation. Homepage gets viewport centering.

**Tech Stack:** Astro 6, CSS Grid, vanilla JS, WOFF2 fonts

**Spec:** `docs/superpowers/specs/2026-03-17-site-redesign-design.md`

---

### Task 1: Self-Host Fonts

**Files:**
- Create: `public/fonts/inter-300.woff2`, `inter-400.woff2`, `inter-500.woff2`
- Create: `public/fonts/newsreader-300.woff2`, `newsreader-400.woff2`, `newsreader-500.woff2`
- Create: `public/fonts/newsreader-300-italic.woff2`, `newsreader-400-italic.woff2`
- Delete: `public/fonts/atkinson-bold.woff`, `public/fonts/atkinson-regular.woff`
- Modify: `src/styles/global.css` (add `@font-face` declarations)
- Modify: `src/components/BaseHead.astro` (remove Google Fonts `<link>`)

- [ ] **Step 1: Download Inter WOFF2 files**

Download Inter weights 300, 400, 500 from Google Fonts API as WOFF2:

```bash
curl -o public/fonts/inter-300.woff2 "https://fonts.gstatic.com/s/inter/v18/UcCo3FwrK3iLTcviYwY.woff2"
```

Use the Google Fonts CSS to find exact WOFF2 URLs. Fetch the CSS with a WOFF2-capable user-agent header:

```bash
curl -H "User-Agent: Mozilla/5.0 (Macintosh)" \
  "https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500&display=swap" \
  2>/dev/null
```

Extract the `url(...)` values for each weight and download each file to `public/fonts/`.

- [ ] **Step 2: Download Newsreader WOFF2 files**

Same approach for Newsreader — fetch the CSS:

```bash
curl -H "User-Agent: Mozilla/5.0 (Macintosh)" \
  "https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,300;0,6..72,400;0,6..72,500;1,6..72,300;1,6..72,400&display=swap" \
  2>/dev/null
```

Download each WOFF2 file. Newsreader has multiple unicode-range subsets per weight — download the latin subset (covers English text). Name files descriptively: `newsreader-400.woff2`, `newsreader-400-italic.woff2`, etc.

- [ ] **Step 3: Delete old Atkinson font files**

```bash
rm public/fonts/atkinson-bold.woff public/fonts/atkinson-regular.woff
```

- [ ] **Step 4: Add `@font-face` declarations to `global.css`**

Add at the top of `src/styles/global.css`, before `:root`:

```css
/* Inter */
@font-face {
  font-family: 'Inter';
  src: url('/fonts/inter-300.woff2') format('woff2');
  font-weight: 300;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: 'Inter';
  src: url('/fonts/inter-400.woff2') format('woff2');
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: 'Inter';
  src: url('/fonts/inter-500.woff2') format('woff2');
  font-weight: 500;
  font-style: normal;
  font-display: swap;
}

/* Newsreader */
@font-face {
  font-family: 'Newsreader';
  src: url('/fonts/newsreader-300.woff2') format('woff2');
  font-weight: 300;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: 'Newsreader';
  src: url('/fonts/newsreader-400.woff2') format('woff2');
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: 'Newsreader';
  src: url('/fonts/newsreader-500.woff2') format('woff2');
  font-weight: 500;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: 'Newsreader';
  src: url('/fonts/newsreader-300-italic.woff2') format('woff2');
  font-weight: 300;
  font-style: italic;
  font-display: swap;
}
@font-face {
  font-family: 'Newsreader';
  src: url('/fonts/newsreader-400-italic.woff2') format('woff2');
  font-weight: 400;
  font-style: italic;
  font-display: swap;
}
```

- [ ] **Step 5: Remove Google Fonts links from `BaseHead.astro`**

In `src/components/BaseHead.astro`, remove these three lines (lines 28-30):

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&family=Newsreader:ital,opsz,wght@0,6..72,300;0,6..72,400;0,6..72,500;1,6..72,300;1,6..72,400&display=swap" rel="stylesheet" />
```

- [ ] **Step 6: Verify fonts load**

```bash
cd /Users/davidbloom/workspaces/personal-site && npm run dev
```

Open `http://localhost:4321` — confirm Inter and Newsreader render correctly. Check the Network tab to confirm fonts load from `/fonts/` not `fonts.googleapis.com`.

- [ ] **Step 7: Commit**

```bash
git add public/fonts/ src/styles/global.css src/components/BaseHead.astro
git commit -m "feat: self-host Inter and Newsreader fonts, remove Google Fonts dependency"
```

---

### Task 2: Typography + Small Fixes

**Files:**
- Modify: `src/styles/global.css`

- [ ] **Step 1: Update body typography in `global.css`**

Change the body rule:
- `font-size: var(--font-size-body)` (line 29) → `font-size: 1rem`
- `line-height: 1.35` (line 31) → `line-height: 1.6`

Update `--font-size-body` in `:root` to `1rem` (line 12).

- [ ] **Step 2: Update blockquote font size**

Change blockquote `font-size` (line 88) from `1.25rem` to `1.125rem`.

- [ ] **Step 3: Fix `pre > code` reset**

Replace `all: unset` (line 129) with targeted overrides:

```css
pre > code {
  background: none;
  padding: 0;
  border-radius: 0;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 0.85em;
}
```

- [ ] **Step 4: Verify typography**

```bash
cd /Users/davidbloom/workspaces/personal-site && npm run dev
```

Open `http://localhost:4321/essays/sample-essay/` — confirm body text is 16px, line-height is visibly more spacious, blockquotes and code blocks render correctly.

- [ ] **Step 5: Commit**

```bash
git add src/styles/global.css
git commit -m "feat: increase body text to 1rem/1.6 line-height, fix pre>code reset, adjust blockquote size"
```

---

### Task 3: Footer Removal + .gitignore

**Files:**
- Delete: `src/components/Footer.astro`
- Modify: `src/layouts/BlogPost.astro` (remove Footer import and usage)
- Modify: `src/pages/index.astro` (remove Footer import and usage)
- Modify: `.gitignore`

- [ ] **Step 1: Remove Footer from `BlogPost.astro`**

In `src/layouts/BlogPost.astro`:
- Remove the import line: `import Footer from '../components/Footer.astro';` (line 5)
- Remove the usage: `<Footer />` (line 50)

- [ ] **Step 2: Remove Footer from `index.astro`**

In `src/pages/index.astro`:
- Remove the import line: `import Footer from '../components/Footer.astro';` (line 3)
- Remove the usage: `<Footer />` (line 50)

- [ ] **Step 3: Delete Footer component**

```bash
rm src/components/Footer.astro
```

- [ ] **Step 4: Add `.superpowers/` to `.gitignore`**

Append `.superpowers/` to `.gitignore`.

- [ ] **Step 5: Verify**

```bash
cd /Users/davidbloom/workspaces/personal-site && npm run dev
```

Confirm no build errors. Check both homepage and essay page — no copyright footer.

- [ ] **Step 6: Commit**

```bash
git add src/layouts/BlogPost.astro src/pages/index.astro .gitignore
git rm src/components/Footer.astro
git commit -m "feat: remove copyright footer, add .superpowers/ to .gitignore"
```

---

### Task 4: Homepage Vertical Centering

**Files:**
- Modify: `src/pages/index.astro`

- [ ] **Step 1: Add vertical centering to homepage**

In `src/pages/index.astro`, the `<body>` already has `display: flex; flex-direction: column` from `global.css`. With the footer removed, add a wrapper or style the body to center the grid.

Replace the `<body>` content with:

```html
<body>
  <div class="page-wrapper">
    <div class="page-grid">
      <!-- existing left-col, main, aside content unchanged -->
    </div>
  </div>
</body>
```

Add styles:

```css
.page-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 2em var(--col-gap);
}

.page-grid {
  display: grid;
  column-gap: var(--col-gap);
  max-width: var(--page-width);
  width: 100%;
  grid-template-columns: 1fr;
}
```

The `min-height: 100vh` + flexbox centering gives Friedman-style vertical centering. The `padding: 2em` prevents content from touching edges when the list is tall enough to fill the viewport.

**Important:** Preserve the existing `@media (min-width: 64em)` rule that sets `.page-grid` to `grid-template-columns: var(--side-col) 1fr var(--side-col)`. The new styles add the wrapper; they don't replace the desktop grid breakpoint.

- [ ] **Step 2: Verify**

```bash
cd /Users/davidbloom/workspaces/personal-site && npm run dev
```

Open `http://localhost:4321` — confirm the 3-column grid is vertically centered. Resize the window vertically to confirm it stays centered with few posts and scrolls naturally when content exceeds viewport.

- [ ] **Step 3: Commit**

```bash
git add src/pages/index.astro
git commit -m "feat: vertically center homepage content (Friedman-style)"
```

---

### Task 5: Sidenote Component Rewrite

**Files:**
- Modify: `src/components/Sidenote.astro`

- [ ] **Step 1: Rewrite Sidenote.astro**

Replace the current float-based component. The new markup splits into an inline reference (stays in prose) and a sidenote body (will be moved by script in BlogPost):

```astro
---
interface Props {
  id: number;
}
const { id } = Astro.props;
---

<span class="sidenote-ref">
  <label class="sidenote-number" for={`sn-${id}`}>{id}</label>
  <input type="checkbox" id={`sn-${id}`} class="sidenote-toggle" />
  <span class="sidenote" data-sidenote-id={id}>
    <span class="sidenote-content">
      <span class="sidenote-num">{id}</span> <slot />
    </span>
    <button class="sidenote-more">More ↓</button>
  </span>
</span>

<style>
  .sidenote-toggle {
    display: none;
  }
  .sidenote-number {
    font-family: var(--font-ui);
    font-size: 0.7em;
    vertical-align: super;
    color: var(--accent);
    cursor: pointer;
    line-height: 0;
  }
  /* Desktop: sidenotes will be moved to the sidenote column by script.
     These styles apply once they're in the column. */
  .sidenote {
    display: block;
    font-family: var(--font-ui);
    font-size: 0.75rem;
    font-weight: 300;
    line-height: 1.6;
    color: var(--text);
    margin-bottom: 0.75em;
  }
  .sidenote-content {
    display: block;
    overflow: hidden;
  }
  .sidenote.truncated .sidenote-content {
    max-height: 6em;
    -webkit-mask-image: linear-gradient(to bottom, black 60%, transparent 100%);
    mask-image: linear-gradient(to bottom, black 60%, transparent 100%);
  }
  .sidenote-more {
    display: none;
    font-family: var(--font-ui);
    font-size: 0.65rem;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-light);
    cursor: pointer;
    margin-top: 0.4em;
    background: none;
    border: none;
    padding: 0;
  }
  .sidenote-more:hover {
    color: var(--accent);
  }
  .sidenote-more.visible {
    display: block;
  }
  .sidenote-num {
    font-size: 0.85em;
    color: var(--accent);
    margin-right: 0.3em;
  }

  /* Mobile: sidenotes stay inline, toggle via checkbox */
  @media (max-width: 63.99em) {
    .sidenote {
      display: none;
      margin: 0.5em 0 0.5em 1.5em;
      padding-left: 1em;
      border-left: 2px solid var(--border);
    }
    .sidenote-toggle:checked + .sidenote {
      display: block;
    }
    .sidenote-more {
      display: none !important;
    }
    .sidenote.truncated .sidenote-content {
      max-height: none;
      -webkit-mask-image: none;
      mask-image: none;
    }
  }
</style>
```

Key change: on desktop, the `.sidenote` has `display: block` instead of `float: right` with negative margins. It will be positioned by the grid column once the BlogPost script moves it there.

- [ ] **Step 2: Verify no build errors**

```bash
cd /Users/davidbloom/workspaces/personal-site && npx astro build
```

Expected: builds successfully. The essay page may look broken at this point (sidenotes visible inline on desktop) — that's expected until Task 6 adds the grid and DOM mover.

- [ ] **Step 3: Commit**

```bash
git add src/components/Sidenote.astro
git commit -m "feat: rewrite Sidenote component for grid-based layout (removes float positioning)"
```

---

### Task 6: BlogPost Grid Rewrite + Sidenote DOM Mover

**Files:**
- Modify: `src/layouts/BlogPost.astro`

This is the largest task. It rewrites the essay layout grid, adds the sidenote column and DOM mover script, and updates the prose max-width.

- [ ] **Step 1: Update the HTML structure**

In `BlogPost.astro`, update the grid HTML. Add the sidenote column div:

```html
<div class="essay-grid">
  <div class="grid-header">
    <Header />
  </div>

  <nav class="toc" id="toc">
    <div class="toc-inner">
      <span class="toc-title">Contents</span>
      <ol id="toc-list"></ol>
    </div>
  </nav>

  <header class="essay-header">
    <div class="dates">
      {updatedDate && (
        <span class="update-date">Last updated: <FormattedDate date={updatedDate} /></span>
      )}
      <span class="pub-date">Published: <FormattedDate date={pubDate} /></span>
    </div>
    <h1>{title}</h1>
  </header>

  <main class="essay-body">
    <div class="prose">
      <slot />
    </div>
  </main>

  <div class="sidenote-column" id="sidenote-column"></div>
</div>
```

- [ ] **Step 2: Rewrite the grid CSS**

Replace the `.essay-grid` styles:

```css
.essay-grid {
  display: grid;
  column-gap: var(--col-gap);
  max-width: var(--page-width);
  margin: 0 auto;
  padding: 0 var(--col-gap);
  grid-template-areas:
    "header"
    "toc"
    "main";
  grid-template-columns: 1fr;
}

@media (min-width: 64em) {
  .essay-grid {
    grid-template-areas:
      ". grid-header ."
      "toc header sidenotes"
      "toc main sidenotes";
    grid-template-columns: var(--side-col) 1fr var(--side-col);
  }
}

.sidenote-column {
  grid-area: sidenotes;
  padding-top: 1em;
}

@media (max-width: 63.99em) {
  .sidenote-column {
    display: none;
  }
}
```

- [ ] **Step 3: Add prose max-width and line-height**

Update the `.prose` styles:

```css
.prose {
  line-height: 1.6;
  font-size: 1rem;
  max-width: 640px;
}
```

- [ ] **Step 4: Write the sidenote DOM mover script**

Replace the existing `setupSidenotes()` function in the `<script>` tag. The new version moves sidenote DOM nodes on desktop and handles resize:

```javascript
function setupSidenotes() {
  const TRUNCATE_HEIGHT = 96;
  const prose = document.querySelector('.prose');
  const column = document.getElementById('sidenote-column');
  if (!prose || !column) return;

  const mql = window.matchMedia('(min-width: 64em)');

  function moveSidenotesToColumn() {
    const notes = prose.querySelectorAll('.sidenote');
    notes.forEach((note) => {
      column.appendChild(note);
      note.style.display = 'block';
    });
  }

  function moveSidenotesBack() {
    const notes = column.querySelectorAll('.sidenote');
    notes.forEach((note) => {
      const id = note.getAttribute('data-sidenote-id');
      const ref = prose.querySelector(`label[for="sn-${id}"]`);
      if (ref && ref.closest('.sidenote-ref')) {
        ref.closest('.sidenote-ref').appendChild(note);
      }
      note.style.display = '';
    });
  }

  function handleResize(e) {
    if (e.matches) {
      moveSidenotesToColumn();
    } else {
      moveSidenotesBack();
    }
  }

  // Initial setup
  if (mql.matches) {
    moveSidenotesToColumn();
  }
  mql.addEventListener('change', handleResize);

  // Truncation behavior — defer to next frame so browser has laid out
  // the sidenotes in their new column before measuring scrollHeight
  requestAnimationFrame(() => {
  document.querySelectorAll('.sidenote').forEach((note) => {
    const content = note.querySelector('.sidenote-content');
    const btn = note.querySelector('.sidenote-more');
    if (!content || !btn) return;

    if (content.scrollHeight > TRUNCATE_HEIGHT) {
      note.classList.add('truncated');
      btn.classList.add('visible');
      btn.textContent = 'More \u2304';
      btn.addEventListener('click', () => {
        const isTruncated = note.classList.contains('truncated');
        if (isTruncated) {
          note.classList.remove('truncated');
          btn.textContent = 'Less \u2303';
        } else {
          note.classList.add('truncated');
          btn.textContent = 'More \u2304';
        }
      });
    }
  });
  }); // end requestAnimationFrame
}
setupSidenotes();
```

- [ ] **Step 5: Update subscribe button to `<a>` tag (prep for modal in Task 8)**

Replace:
```html
<button class="subscribe-btn" onclick="window.location.href='/rss.xml'">Subscribe</button>
```

With:
```html
<a href="#" class="subscribe-btn" id="subscribe-trigger">Subscribe</a>
```

Keep existing `.subscribe-btn` CSS (will be updated in Task 8).

- [ ] **Step 6: Remove Footer import**

Remove the Footer import line if not already done in Task 3. (If Task 3 is done first, this is a no-op.)

- [ ] **Step 7: Verify**

```bash
cd /Users/davidbloom/workspaces/personal-site && npm run dev
```

Open `http://localhost:4321/essays/sample-essay/` — confirm:
- 3-column grid: TOC left, content center (max 640px), sidenotes right
- Sidenotes appear in the right column, stacked without overlap
- Resize below 64em: sidenotes disappear from right column, toggle inline via superscript click
- Prose text is 16px with 1.6 line-height
- Truncation "More ↓" works on long sidenotes

- [ ] **Step 8: Commit**

```bash
git add src/layouts/BlogPost.astro
git commit -m "feat: rewrite essay layout to CSS Grid with sidenote column and DOM relocation"
```

---

### Task 7: TOC Rewrite — Nested Numbering

**Files:**
- Modify: `src/layouts/BlogPost.astro` (the `buildTOC()` function and TOC styles)

- [ ] **Step 1: Rewrite `buildTOC()` function**

Replace the existing `buildTOC()` in the `<script>` tag:

```javascript
function buildTOC() {
  const prose = document.querySelector('.prose');
  const tocList = document.getElementById('toc-list');
  const toc = document.getElementById('toc');
  if (!prose || !tocList || !toc) return;

  const headings = prose.querySelectorAll('h2, h3, h4');
  if (headings.length === 0) {
    toc.style.display = 'none';
    return;
  }

  let h2Count = 0, h3Count = 0, h4Count = 0;
  let currentH2Li = null;
  let currentH2Ol = null;
  let currentH3Li = null;
  let currentH3Ol = null;

  headings.forEach((heading, i) => {
    const id = heading.id || `section-${i}`;
    heading.id = id;

    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = `#${id}`;

    const chevron = document.createElement('span');
    chevron.classList.add('toc-chevron');
    chevron.textContent = ' \u203A';

    if (heading.tagName === 'H2') {
      h2Count++;
      h3Count = 0;
      h4Count = 0;
      a.textContent = `${h2Count}. ${heading.textContent}`;
      li.appendChild(a);
      li.appendChild(chevron);
      tocList.appendChild(li);
      currentH2Li = li;
      currentH2Ol = null;
      currentH3Li = null;
      currentH3Ol = null;
    } else if (heading.tagName === 'H3') {
      h3Count++;
      h4Count = 0;
      a.textContent = `${h2Count}.${h3Count} ${heading.textContent}`;
      li.appendChild(a);
      li.appendChild(chevron);
      if (!currentH2Ol) {
        currentH2Ol = document.createElement('ol');
        currentH2Li.appendChild(currentH2Ol);
      }
      currentH2Ol.appendChild(li);
      currentH3Li = li;
      currentH3Ol = null;
    } else if (heading.tagName === 'H4') {
      h4Count++;
      a.textContent = `${h2Count}.${h3Count}.${h4Count} ${heading.textContent}`;
      li.appendChild(a);
      li.appendChild(chevron);
      if (!currentH3Ol) {
        currentH3Ol = document.createElement('ol');
        if (currentH3Li) {
          currentH3Li.appendChild(currentH3Ol);
        } else if (currentH2Ol) {
          currentH2Ol.appendChild(li);
          return;
        }
      }
      currentH3Ol.appendChild(li);
    }
  });

  // Scrollspy
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const id = entry.target.id;
        const tocLink = tocList.querySelector(`a[href="#${id}"]`);
        if (tocLink) {
          if (entry.isIntersecting) {
            tocList.querySelectorAll('a').forEach((a) => a.classList.remove('active'));
            tocLink.classList.add('active');
          }
        }
      });
    },
    { rootMargin: '-80px 0px -80% 0px' }
  );

  headings.forEach((heading) => observer.observe(heading));
}
buildTOC();
```

- [ ] **Step 2: Update TOC styles**

Update the TOC CSS in the `<style>` block:

```css
.toc ol {
  list-style: none;
  padding: 0;
  margin: 0;
}
.toc ol ol {
  padding-left: 1em;
}
.toc li {
  margin-bottom: 0.4em;
  line-height: 1.35;
}
.toc a {
  color: var(--text-light);
  text-decoration: none;
  transition: color 0.15s ease;
}
.toc a:hover,
.toc a.active {
  color: var(--accent);
}
.toc-chevron {
  color: var(--text-light);
  font-size: 0.85em;
  margin-left: 0.15em;
}
```

- [ ] **Step 3: Verify**

```bash
cd /Users/davidbloom/workspaces/personal-site && npm run dev
```

Open `http://localhost:4321/essays/sample-essay/` — confirm:
- TOC shows numbered entries: "1. On the purpose of personal websites ›", "2. Mathematics on the web ›", "3. What comes next ›"
- No h3/h4 entries in the sample essay, so no nesting visible yet — but the code handles them
- Scrollspy highlights the active section
- Chevron arrows appear after each entry

- [ ] **Step 4: Commit**

```bash
git add src/layouts/BlogPost.astro
git commit -m "feat: rewrite TOC with nested numbering (h2/h3/h4) and chevron arrows"
```

---

### Task 8: Subscribe Modal

**Files:**
- Modify: `src/layouts/BlogPost.astro`

- [ ] **Step 1: Add modal HTML**

After the subscribe trigger `<a>`, add the modal markup:

```html
<a href="#" class="subscribe-btn" id="subscribe-trigger">Subscribe</a>

<div class="subscribe-modal" id="subscribe-modal">
  <div class="subscribe-backdrop" id="subscribe-backdrop"></div>
  <div class="subscribe-modal-content">
    <button class="subscribe-close" id="subscribe-close">&times;</button>
    <span class="subscribe-heading">Subscribe</span>
    <ul class="subscribe-links">
      <li><a href="/rss.xml">RSS</a></li>
      <li><a href="#">Substack</a></li>
    </ul>
  </div>
</div>
```

- [ ] **Step 2: Add modal styles**

```css
.subscribe-modal {
  display: none;
  position: fixed;
  inset: 0;
  z-index: 1000;
}
.subscribe-modal.open {
  display: block;
}
.subscribe-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.2);
}
.subscribe-modal-content {
  position: fixed;
  bottom: 2em;
  right: 2em;
  background: #fff;
  padding: 1.5em;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  border-radius: 6px;
  width: 220px;
  z-index: 1001;
}
.subscribe-close {
  position: absolute;
  top: 0.5em;
  right: 0.75em;
  background: none;
  border: none;
  font-size: 1.25rem;
  cursor: pointer;
  color: var(--text-muted);
  padding: 0;
  line-height: 1;
}
.subscribe-close:hover {
  color: var(--text);
}
.subscribe-heading {
  font-family: var(--font-ui);
  font-size: 0.85rem;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text);
  display: block;
  margin-bottom: 0.75em;
}
.subscribe-links {
  list-style: none;
  padding: 0;
  margin: 0;
}
.subscribe-links li {
  margin-bottom: 0.4em;
}
.subscribe-links a {
  font-family: var(--font-ui);
  font-size: 0.85rem;
  color: var(--accent);
  text-decoration: none;
}
.subscribe-links a:hover {
  text-decoration: underline;
}
```

- [ ] **Step 3: Add modal script**

Add to the `<script>` tag:

```javascript
function setupSubscribeModal() {
  const trigger = document.getElementById('subscribe-trigger');
  const modal = document.getElementById('subscribe-modal');
  const backdrop = document.getElementById('subscribe-backdrop');
  const closeBtn = document.getElementById('subscribe-close');
  if (!trigger || !modal) return;

  trigger.addEventListener('click', (e) => {
    e.preventDefault();
    modal.classList.add('open');
  });

  function closeModal() {
    modal.classList.remove('open');
  }

  closeBtn.addEventListener('click', closeModal);
  backdrop.addEventListener('click', closeModal);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });
}
setupSubscribeModal();
```

- [ ] **Step 4: Verify**

```bash
cd /Users/davidbloom/workspaces/personal-site && npm run dev
```

Open `http://localhost:4321/essays/sample-essay/` — confirm:
- "Subscribe" button fixed bottom-right
- Click opens a modal near the button with RSS + Substack links
- Close via × button, backdrop click, or Escape key
- Links are clickable (RSS goes to `/rss.xml`, Substack is `#` placeholder)

- [ ] **Step 5: Commit**

```bash
git add src/layouts/BlogPost.astro
git commit -m "feat: add subscribe modal with RSS and Substack links"
```

---

### Task 9: Final Build Verification

- [ ] **Step 1: Run full build**

```bash
cd /Users/davidbloom/workspaces/personal-site && npx astro build
```

Expected: clean build with no errors or warnings.

- [ ] **Step 2: Preview production build**

```bash
npx astro preview
```

Open `http://localhost:4321` — walk through:
- Homepage: vertically centered, 3-column grid, no footer
- Essay page: proper typography, sidenotes in right column, nested TOC, subscribe modal
- Mobile (resize to narrow): single column, sidenotes toggle inline, TOC at top
- Fonts load from `/fonts/` (check Network tab)

- [ ] **Step 3: Final commit if any cleanup needed**

```bash
git add -A
git status
```

Only commit if there are remaining changes.
