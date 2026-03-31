# Visual Polish Fix

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix four visual issues identified after the initial redesign: homepage layout/spacing, sidenote vertical positioning, sidenote truncation style, and h2 section dividers.

**Architecture:** CSS and JS changes only. No new components or dependencies.

**Tech Stack:** Astro 6, CSS, vanilla JS

---

### Task 1: Homepage — Header Row + Tighter Grid

Two problems with the homepage:
1. `--page-width: 1392px` spreads columns too far apart. Friedman uses ~1100px.
2. "David Bloom" is inside the left column, so the three columns don't share a top alignment. Friedman has her name in a header row spanning the full width, with three columns starting at the same baseline below.

Fix: pull Header out of the left column into its own row above the grid, reduce max-width to 900px.

**Files:**
- Modify: `src/pages/index.astro`

- [ ] **Step 1: Restructure HTML — header above grid**

Move the `<Header />` component out of `.left-col` and place it above `.page-grid` (but still inside `.page-wrapper`):

```html
<div class="page-wrapper">
	<div class="page-container">
		<Header />
		<div class="page-grid">
			<div class="left-col">
				<h1 class="sr-only">David Bloom</h1>
				<p class="bio">
					I study mathematics and philosophy at Yale.
					I write about philosophy, AI, and whatever else I find interesting.
				</p>
			</div>

			<main>
				<ul class="essay-list">
					<!-- existing content -->
				</ul>
			</main>

			<aside class="right-col">
				<!-- existing content -->
			</aside>
		</div>
	</div>
</div>
```

The `page-container` groups the header and grid so they share the same max-width and the wrapper can center them as a unit.

- [ ] **Step 2: Update styles**

```css
.page-wrapper {
	display: flex;
	align-items: center;
	justify-content: center;
	min-height: 100vh;
	padding: 2em var(--col-gap);
}

.page-container {
	max-width: 900px;
	width: 100%;
}

.page-grid {
	display: grid;
	column-gap: var(--col-gap);
	width: 100%;
	grid-template-columns: 1fr;
}
```

Remove `max-width` from `.page-grid` (now on `.page-container`). The desktop media query for `.page-grid` stays the same:

```css
@media (min-width: 64em) {
	.page-grid {
		grid-template-columns: var(--side-col) 1fr var(--side-col);
	}
}
```

- [ ] **Step 3: Verify**

Run `npm run dev`. Homepage should show:
- "David Bloom" as a header spanning the full width at top
- Three columns (bio | essays | links) starting at the same vertical baseline below
- Columns closer together (900px container)
- Still vertically centered in viewport

- [ ] **Step 4: Commit**

```bash
git add src/pages/index.astro
git commit -m "fix: homepage header row above grid, tighten to 900px max-width"
```

---

### Task 2: Sidenote Vertical Positioning

The DOM mover appends all sidenotes to the column where they stack from the top. They should align vertically with their corresponding superscripts.

Approach: `position: relative` on the sidenote column, `position: absolute` on each sidenote with `top` calculated from the superscript's position. Overlap prevention pushes lower sidenotes down.

**Files:**
- Modify: `src/layouts/BlogPost.astro` (sidenote column CSS + `setupSidenotes()` script)

- [ ] **Step 1: Make sidenote column position-relative**

Update `.sidenote-column` in the `<style>` block:

```css
.sidenote-column {
	grid-area: sidenotes;
	position: relative;
}
```

Remove `padding-top: 1em`.

- [ ] **Step 2: Rewrite `moveSidenotesToColumn()` with positioning**

Replace the function body. Note: this function only moves the notes to the column. Positioning is deferred until after truncation (see Step 4).

```javascript
function moveSidenotesToColumn() {
	const notes = prose.querySelectorAll('.sidenote');
	notes.forEach((note) => {
		column.appendChild(note);
		note.style.display = 'block';
		note.style.position = 'absolute';
		note.style.width = '100%';
	});
}
```

- [ ] **Step 2b: Add a `positionSidenotes()` function**

This runs AFTER truncation has been applied (called inside the existing `requestAnimationFrame` callback, after truncation logic):

```javascript
function positionSidenotes() {
	const notes = column.querySelectorAll('.sidenote');
	const gridRect = document.querySelector('.essay-grid').getBoundingClientRect();
	const colRect = column.getBoundingClientRect();
	const colOffsetTop = colRect.top - gridRect.top;
	let lastBottom = 0;

	notes.forEach((note) => {
		const id = note.getAttribute('data-sidenote-id');
		const ref = document.querySelector(`label[for="sn-${id}"]`);
		if (!ref) return;

		const refRect = ref.getBoundingClientRect();
		let targetTop = (refRect.top - gridRect.top) - colOffsetTop;

		// Prevent overlap with previous sidenote
		if (targetTop < lastBottom) {
			targetTop = lastBottom;
		}

		note.style.top = targetTop + 'px';
		lastBottom = targetTop + note.offsetHeight + 12;
	});
}
```

- [ ] **Step 3: Update `moveSidenotesBack()` to clear positioning**

Clear inline styles when moving back to mobile:

```javascript
function moveSidenotesBack() {
	const notes = column.querySelectorAll('.sidenote');
	notes.forEach((note) => {
		const id = note.getAttribute('data-sidenote-id');
		const ref = prose.querySelector(`label[for="sn-${id}"]`);
		if (ref && ref.closest('.sidenote-ref')) {
			ref.closest('.sidenote-ref').appendChild(note);
		}
		note.style.display = '';
		note.style.position = '';
		note.style.top = '';
		note.style.width = '';
	});
}
```

- [ ] **Step 4: Update `requestAnimationFrame` to call `positionSidenotes()` after truncation**

In the existing `requestAnimationFrame` callback in `setupSidenotes()`, add `positionSidenotes()` as the last line — after the truncation `forEach` loop. This ensures positioning uses the correct (post-truncation) `offsetHeight` values:

```javascript
requestAnimationFrame(() => {
	document.querySelectorAll('.sidenote').forEach((note) => {
		// ... existing truncation logic ...
	});
	// Position after truncation so offsetHeight reflects truncated size
	positionSidenotes();
});
```

Also call `positionSidenotes()` after `moveSidenotesToColumn()` inside `handleResize` — wrap it in a `requestAnimationFrame` there too.

- [ ] **Step 5: Verify**

Run `npm run dev`. On the essay page:
- Each sidenote appears next to its superscript in the prose
- If two are close, the lower one pushes down to avoid overlap
- Resize to mobile: sidenotes return inline, toggle via checkbox

- [ ] **Step 6: Commit**

```bash
git add src/layouts/BlogPost.astro
git commit -m "fix: position sidenotes alongside their superscripts"
```

---

### Task 3: Sidenote Truncation — Ellipsis Instead of Gradient

Carlsmith uses `...` at the end of truncated text with `MORE ∨` below. Current implementation uses a gradient mask fade-out.

**Files:**
- Modify: `src/components/Sidenote.astro` (CSS)
- Modify: `src/layouts/BlogPost.astro` (button text in script)

- [ ] **Step 1: Replace gradient mask with line-clamp**

In `src/components/Sidenote.astro`, replace the truncation CSS:

```css
.sidenote.truncated .sidenote-content {
	display: -webkit-box;
	-webkit-line-clamp: 5;
	-webkit-box-orient: vertical;
	overflow: hidden;
}
```

This replaces the entire existing `.sidenote.truncated .sidenote-content` rule — remove `max-height: 6em`, `mask-image`, and `-webkit-mask-image` completely.

Also delete the mobile media query block for `.sidenote.truncated .sidenote-content` (which reset `max-height` and `mask-image`) — on mobile, truncation is disabled because sidenotes are hidden by default and `!important` on `.sidenote-more` hides the button.

Also update the default button text in `Sidenote.astro` line 15 from `More ↓` to `MORE ∨` for consistency (the JS will override this on load, but the HTML default should match).

- [ ] **Step 2: Uppercase MORE/LESS in script**

In `src/layouts/BlogPost.astro`'s `setupSidenotes()`, change:
- `'More \u2304'` → `'MORE \u2304'`
- `'Less \u2303'` → `'LESS \u2303'`

(There are two `More` occurrences and one `Less` occurrence in the script — update all of them.)

- [ ] **Step 3: Verify**

Run `npm run dev`. Sidenote 2 (the long one) should show ~5 lines of text ending with `...`, then `MORE ∨` below. Clicking it expands the full text and shows `LESS ∧`.

- [ ] **Step 4: Commit**

```bash
git add src/components/Sidenote.astro src/layouts/BlogPost.astro
git commit -m "fix: ellipsis truncation for sidenotes, uppercase MORE/LESS"
```

---

### Task 4: Remove h2 Section Dividers

Current `global.css` adds `border-bottom: 1px solid var(--border)` on h2 headings. Carlsmith does not use divider lines between sections — headings are distinguished by size and spacing alone.

**Files:**
- Modify: `src/styles/global.css`

- [ ] **Step 1: Remove h2 border-bottom**

In `src/styles/global.css`, remove these two lines from the h2 rule:

```css
padding-bottom: 0.3em;
border-bottom: 1px solid var(--border);
```

The h2 rule should become:

```css
h2 {
	font-size: var(--font-size-h2);
	font-weight: 400;
	margin: 2em 0 0.5em;
}
```

- [ ] **Step 2: Verify**

Run `npm run dev`. Essay page headings should have no horizontal line below them.

- [ ] **Step 3: Commit**

```bash
git add src/styles/global.css
git commit -m "fix: remove h2 border-bottom dividers"
```

---

### Task 5: Final Verification

- [ ] **Step 1: Full build**

```bash
npx astro build
```

- [ ] **Step 2: Visual check**

Run `npm run dev` and verify:
- Homepage: header row above, three columns aligned, 900px container, centered
- Essay: sidenotes next to their superscripts, ellipsis truncation, no h2 dividers
- Mobile: everything collapses cleanly
