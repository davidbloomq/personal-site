/**
 * Single margin-layout pass shared by sidenotes (BlogPost.astro) and
 * annotation cards (annotations.js). There must be exactly one stacking
 * implementation — do not fork this algorithm.
 *
 * Sub-pass 1 places sidenotes at their preferred offsets with the existing
 * push-down rule — equivalent to the old positionSidenotes() when no cards
 * are registered. Sub-pass 2 places cards in the remaining gaps, pushed down
 * (never up) past any sidenote they would overlap, with the same >= 12px gap.
 * Sidenote positions are never affected by sub-pass 2.
 *
 * annotations.js registers its items via setCardProvider() and requests a
 * relayout by calling layoutMargin(). The provider is called with the layout
 * context and returns absolutely-positioned elements already in the column:
 *   [{ el, anchorTop, orphan? }]   anchorTop: preferred top relative to the
 *   column (same coordinate space as sidenote tops); orphan items are stacked
 *   after the last positioned item regardless of anchorTop.
 *
 * Returns placements for provider items: [{ el, top, displacement }]
 * (displacement = how far below its anchor a card ended up — annotations.js
 * uses it for the auto-collapse rule).
 */

const GAP = 12;

let cardProvider = null;

export function setCardProvider(fn) {
	cardProvider = fn;
}

export function layoutMargin() {
	const grid = document.querySelector('.essay-grid');
	const column = document.getElementById('sidenote-column');
	if (!grid || !column) return [];

	const gridRect = grid.getBoundingClientRect();
	const colRect = column.getBoundingClientRect();
	const colOffsetTop = colRect.top - gridRect.top;

	// --- Sub-pass 1: sidenotes (existing push-down rule, unchanged) ---
	const notes = Array.from(column.querySelectorAll('.sidenote'));
	let lastBottom = 0;
	const occupied = [];

	notes.forEach((note) => {
		const id = note.getAttribute('data-sidenote-id');
		const ref = document.querySelector(`label[for="sn-${id}"]`);
		if (!ref) return;

		const refRect = ref.getBoundingClientRect();
		let targetTop = (refRect.top - gridRect.top) - colOffsetTop;
		if (targetTop < lastBottom) targetTop = lastBottom;

		note.style.top = targetTop + 'px';
		lastBottom = targetTop + note.offsetHeight + GAP;
		occupied.push([targetTop, targetTop + note.offsetHeight]);
	});

	// --- Sub-pass 2: comment cards in the remaining gaps ---
	if (!cardProvider) return [];
	const items = cardProvider({ gridRect, colOffsetTop }) || [];
	if (items.length === 0) return [];

	const anchored = items.filter((it) => !it.orphan).sort((a, b) => a.anchorTop - b.anchorTop);
	const orphans = items.filter((it) => it.orphan);

	const placements = [];
	let lastCardBottom = 0;
	let maxBottom = lastBottom;

	anchored.forEach((item) => {
		const h = item.el.offsetHeight;
		let top = Math.max(item.anchorTop, lastCardBottom);

		// Push down (never up) past any sidenote the card would overlap.
		let moved = true;
		while (moved) {
			moved = false;
			for (const [oTop, oBottom] of occupied) {
				if (top < oBottom + GAP && top + h > oTop - GAP) {
					top = oBottom + GAP;
					moved = true;
				}
			}
		}

		item.el.style.top = top + 'px';
		lastCardBottom = top + h + GAP;
		maxBottom = Math.max(maxBottom, lastCardBottom);
		placements.push({ el: item.el, top, displacement: top - item.anchorTop });
	});

	// Orphans stack after the last positioned item.
	orphans.forEach((item) => {
		item.el.style.top = maxBottom + 'px';
		maxBottom += item.el.offsetHeight + GAP;
		placements.push({ el: item.el, top: item.el.offsetTop, displacement: 0 });
	});

	// Keep the column tall enough that cards never spill past the page bottom.
	// Only set when cards exist so sidenote-only layout is untouched.
	column.style.minHeight = maxBottom + 'px';

	return placements;
}
