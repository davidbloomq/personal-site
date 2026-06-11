/**
 * Annotations: reader comments anchored to text highlights.
 * Spec: specs/annotations.md. Backend: worker/ (Cloudflare Worker + D1).
 *
 * Loaded only on essay pages from BlogPost.astro. If the initial GET fails,
 * the whole feature is a no-op for the pageview — no button, page pristine.
 * All user content (body, name, orphaned `exact` snippets) is rendered via
 * textContent, never innerHTML.
 */

import { layoutMargin, setCardProvider } from './margin-layout.js';

const API_BASE = (() => {
	const { hostname } = location;
	if (hostname === 'localhost' || hostname === '127.0.0.1') return 'http://localhost:8787';
	// GitHub Codespaces forwards each port at <codespace>-<port>.app.github.dev
	const codespace = hostname.match(/^(.+)-\d+(\.app\.github\.dev)$/);
	if (codespace) return `https://${codespace[1]}-8787${codespace[2]}`;
	return 'https://api.david-bloom.com';
})();

const MAX_SELECTION = 1000;
const CONTEXT_CHARS = 32;
// A card pushed more than this far below its highlight auto-collapses
// (layout outcome, not persisted).
const AUTO_COLLAPSE_DISPLACEMENT = 360;

const mqDesktop = window.matchMedia('(min-width: 64em)');

/* ---------- storage (Safari "Block all cookies" throws) ---------- */

const storage = {
	get(key) {
		try { return localStorage.getItem(key); } catch { return null; }
	},
	set(key, value) {
		try { localStorage.setItem(key, value); } catch { /* ignore */ }
	},
	remove(key) {
		try { localStorage.removeItem(key); } catch { /* ignore */ }
	},
};

/* ---------- tiny DOM helper ---------- */

function el(tag, className, text) {
	const node = document.createElement(tag);
	if (className) node.className = className;
	if (text != null) node.textContent = text;
	return node;
}

export default function initAnnotations() {
	const prose = document.querySelector('.prose');
	const column = document.getElementById('sidenote-column');
	const slugMatch = location.pathname.match(/\/essays\/([a-z0-9-]{1,128})\/?$/);
	if (!prose || !column || !slugMatch) return;
	const slug = slugMatch[1];

	/* ---------- state ---------- */

	const state = {
		enabled: storage.get('annotations:enabled') !== 'off',
		total: 0,
		truncated: false,
		threads: [], // see buildThreads()
		activeThreadId: null,
		passphrase: storage.get('annotations:author') || null,
		commenterKey: null,
		savedName: storage.get('annotations:name') || '',
		// top-level compose draft; survives toggle off / click-away
		draft: null, // { anchor, range, text, name, open, error, posting }
		index: null, // canonical text index
	};

	state.commenterKey = storage.get('annotations:key');
	if (!state.commenterKey) {
		const bytes = new Uint8Array(16);
		crypto.getRandomValues(bytes);
		state.commenterKey = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
		storage.set('annotations:key', state.commenterKey);
	}

	/* ---------- canonical text index ----------
	   Concatenated textContent of .prose, excluding .sidenote-ref subtrees
	   (sidenote text changes homes across the 64em breakpoint) and
	   .katex-mathml (hidden MathML duplicate of every formula). Selection
	   capture and re-anchoring share this index. */

	function buildIndex() {
		const segs = [];
		let text = '';
		const walker = document.createTreeWalker(prose, NodeFilter.SHOW_TEXT, {
			acceptNode(node) {
				for (let p = node.parentElement; p && p !== prose; p = p.parentElement) {
					if (p.classList.contains('sidenote-ref') || p.classList.contains('katex-mathml')) {
						return NodeFilter.FILTER_REJECT;
					}
				}
				return NodeFilter.FILTER_ACCEPT;
			},
		});
		let n;
		while ((n = walker.nextNode())) {
			segs.push({ node: n, start: text.length, end: text.length + n.data.length });
			text += n.data;
		}
		return { text, segs };
	}

	function pointToOffset(container, offset) {
		const { segs, text } = state.index;
		if (container.nodeType === Node.TEXT_NODE) {
			const seg = segs.find((s) => s.node === container);
			return seg ? seg.start + Math.min(offset, container.data.length) : null;
		}
		if (!prose.contains(container)) return null;
		const probe = document.createRange();
		probe.setStart(container, Math.min(offset, container.childNodes.length));
		probe.collapse(true);
		for (const seg of segs) {
			const r = document.createRange();
			r.selectNodeContents(seg.node);
			if (probe.compareBoundaryPoints(Range.START_TO_START, r) <= 0) return seg.start;
		}
		return text.length;
	}

	function offsetToPoint(offset) {
		const { segs } = state.index;
		for (const seg of segs) {
			if (offset >= seg.start && offset < seg.end) return [seg.node, offset - seg.start];
		}
		const last = segs[segs.length - 1];
		return last ? [last.node, last.node.data.length] : null;
	}

	function rangeForSpan(start, length) {
		const a = offsetToPoint(start);
		const b = offsetToPoint(start + length - 1);
		if (!a || !b) return null;
		const range = document.createRange();
		range.setStart(a[0], a[1]);
		range.setEnd(b[0], b[1] + 1);
		return range;
	}

	function findAll(haystack, needle) {
		const out = [];
		if (!needle) return out;
		let i = haystack.indexOf(needle);
		while (i !== -1) {
			out.push(i);
			i = haystack.indexOf(needle, i + 1);
		}
		return out;
	}

	// → start offset in canonical text, or null (orphan)
	function resolveAnchor(anchor) {
		const { text } = state.index;
		const prefix = anchor.prefix || '';
		const suffix = anchor.suffix || '';
		const full = findAll(text, prefix + anchor.exact + suffix);
		if (full.length === 1) return full[0] + prefix.length;
		const occ = findAll(text, anchor.exact);
		if (occ.length === 0) return null;
		let best = occ[0];
		for (const o of occ) {
			if (Math.abs(o - anchor.charOffset) < Math.abs(best - anchor.charOffset)) best = o;
		}
		return best;
	}

	/* ---------- API ---------- */

	async function api(path, options = {}) {
		const headers = { ...(options.headers || {}) };
		if (options.body) headers['Content-Type'] = 'application/json';
		if (options.auth && state.passphrase) headers['Authorization'] = `Bearer ${state.passphrase}`;
		const res = await fetch(API_BASE + path, {
			method: options.method || 'GET',
			headers,
			body: options.body ? JSON.stringify(options.body) : undefined,
		});
		const data = await res.json().catch(() => ({}));
		if (!res.ok) {
			const err = new Error(data.error || `HTTP ${res.status}`);
			err.status = res.status;
			throw err;
		}
		return data;
	}

	/* ---------- thread model ---------- */

	function buildThreads(items) {
		const threads = [];
		const byId = new Map();
		for (const item of items) {
			if (!item.parentId) {
				const t = {
					id: item.id,
					root: item,
					replies: [],
					hidden: !!item.hidden,
					start: null,
					range: null,
					orphan: false,
					userCollapsed: storage.get(`annotations:collapsed:${item.id}`) === '1',
					autoCollapsed: false,
					userExpanded: false,
					replyOpen: false,
					replyDraft: '',
					replyError: null,
					cardEl: null,
				};
				threads.push(t);
				byId.set(item.id, t);
			}
		}
		for (const item of items) {
			if (item.parentId) {
				// replies attach to their thread root (nesting flattens to one level visually)
				let pid = item.parentId;
				let t = byId.get(pid);
				if (!t) {
					const parent = items.find((i) => i.id === pid);
					if (parent) t = byId.get(parent.parentId) || null;
				}
				if (t) t.replies.push(item);
			}
		}
		return threads;
	}

	function resolveAll() {
		state.index = buildIndex();
		for (const t of state.threads) {
			if (t.hidden || !t.root.anchor) {
				t.start = null;
				t.range = null;
				t.orphan = false;
				continue;
			}
			const start = resolveAnchor(t.root.anchor);
			t.start = start;
			t.orphan = start == null;
			t.range = start == null ? null : rangeForSpan(start, t.root.anchor.exact.length);
		}
		if (state.draft && state.draft.anchor) {
			const s = resolveAnchor(state.draft.anchor);
			state.draft.start = s;
			state.draft.range = s != null ? rangeForSpan(s, state.draft.anchor.exact.length) : null;
		}
	}

	function visibleCount(t) {
		let n = t.root.deleted ? 0 : 1;
		for (const r of t.replies) if (!r.deleted) n++;
		return n;
	}

	function threadLabel(t) {
		if (t.root.deleted) return 'deleted';
		if (t.root.isAuthor) return 'David';
		return t.root.name || `#${t.root.number}`;
	}

	/* ---------- highlights ---------- */

	const highlightsSupported = typeof CSS !== 'undefined' && CSS.highlights;

	function repaintHighlights() {
		if (!highlightsSupported) return;
		const base = new Highlight();
		const active = new Highlight();
		base.priority = 0;
		active.priority = 1;
		if (state.enabled) {
			for (const t of state.threads) {
				if (t.hidden || !t.range) continue;
				(t.id === state.activeThreadId ? active : base).add(t.range);
			}
			if (state.draft && state.draft.open && state.draft.range) active.add(state.draft.range);
		}
		CSS.highlights.set('comments', base);
		CSS.highlights.set('comment-active', active);
	}

	function setActiveThread(id) {
		if (state.activeThreadId === id) return;
		state.activeThreadId = id;
		repaintHighlights();
		for (const t of state.threads) {
			if (t.cardEl) t.cardEl.classList.toggle('focused', t.id === id);
		}
	}

	/* ---------- toggle button ---------- */

	let toggleBtn = null;

	function updateToggleBtn() {
		if (!toggleBtn) return;
		const n = state.total;
		const count = n > 0 ? ` (${n})` : '';
		toggleBtn.textContent = `Comments${count}: ${state.enabled ? 'on' : 'off'}`;
	}

	function createToggleBtn() {
		toggleBtn = el('button', 'annotations-toggle');
		toggleBtn.type = 'button';
		toggleBtn.addEventListener('click', () => {
			state.enabled = !state.enabled;
			storage.set('annotations:enabled', state.enabled ? 'on' : 'off');
			if (!state.enabled) {
				hideToolbar();
				closeSheet();
				setActiveThread(null);
			}
			updateToggleBtn();
			repaintHighlights();
			renderMargin();
			// An open draft survives off→on, with its compose box restored.
			if (state.enabled && state.draft && state.draft.open && !mqDesktop.matches) {
				openSheet(null, { compose: true });
			}
		});
		document.body.appendChild(toggleBtn);
		updateToggleBtn();
	}

	/* ---------- compose form (shared by new-thread, reply, sheet) ---------- */

	function buildCompose({ draftText, draftName, error, posting, onInput, onNameInput, onPost, onCancel }) {
		const wrap = el('div', 'ann-compose');
		const textarea = el('textarea');
		textarea.placeholder = 'Write a comment…';
		textarea.value = draftText || '';
		textarea.addEventListener('input', () => onInput(textarea.value));
		wrap.appendChild(textarea);

		const nameInput = el('input');
		nameInput.type = 'text';
		nameInput.placeholder = 'anonymous — shown as #N';
		nameInput.maxLength = 40;
		nameInput.value = draftName || '';
		nameInput.addEventListener('input', () => onNameInput(nameInput.value));
		wrap.appendChild(nameInput);

		// Honeypot: hidden from humans; bots that fill it get a plausible 200.
		const hp = el('input', 'ann-hp');
		hp.type = 'text';
		hp.name = 'website';
		hp.tabIndex = -1;
		hp.autocomplete = 'off';
		hp.setAttribute('aria-hidden', 'true');
		wrap.appendChild(hp);

		const row = el('div', 'ann-compose-row');
		let authorCheck = null;
		if (state.passphrase) {
			const lab = el('label', 'ann-author-check');
			authorCheck = el('input');
			authorCheck.type = 'checkbox';
			authorCheck.checked = true;
			lab.appendChild(authorCheck);
			lab.appendChild(document.createTextNode('comment as David (Author)'));
			row.appendChild(lab);
		} else {
			row.appendChild(el('span'));
		}

		const postBtn = el('button', 'ann-post-btn', posting ? 'Posting…' : 'Post');
		postBtn.type = 'button';
		postBtn.disabled = !!posting;
		postBtn.addEventListener('click', () =>
			onPost({ text: textarea.value, name: nameInput.value, honeypot: hp.value, asAuthor: !!(authorCheck && authorCheck.checked) })
		);
		row.appendChild(postBtn);
		wrap.appendChild(row);

		if (onCancel) {
			const cancel = el('button', 'ann-link-btn', 'Cancel');
			cancel.type = 'button';
			cancel.style.marginTop = '0.3em';
			cancel.addEventListener('click', onCancel);
			wrap.appendChild(cancel);
		}
		if (error) wrap.appendChild(el('div', 'ann-error', error));
		wrap._textarea = textarea;
		return wrap;
	}

	/* ---------- posting ---------- */

	async function postComment({ post, parentId, anchor, text, name, honeypot, asAuthor }) {
		const payload = {
			post,
			body: text,
			commenterKey: state.commenterKey,
			website: honeypot || undefined,
		};
		if (parentId) payload.parentId = parentId;
		else payload.anchor = anchor;
		if (name && name.trim()) payload.name = name.trim();
		if (asAuthor) payload.author = true;
		return api('/v1/comments', { method: 'POST', body: payload, auth: asAuthor });
	}

	function rememberName(name) {
		state.savedName = name || '';
		storage.set('annotations:name', state.savedName);
	}

	async function submitNewThread(values) {
		const draft = state.draft;
		if (!draft || !values.text.trim() || draft.posting) return;
		draft.posting = true;
		draft.error = null;
		renderMargin();
		renderSheetIfOpen();
		try {
			const { comment } = await postComment({
				post: slug,
				anchor: draft.anchor,
				text: values.text,
				name: values.name,
				honeypot: values.honeypot,
				asAuthor: values.asAuthor,
			});
			rememberName(values.name);
			state.draft = null;
			state.total++;
			state.threads.push({
				id: comment.id, root: comment, replies: [], hidden: false,
				start: null, range: null, orphan: false,
				userCollapsed: false, autoCollapsed: false, userExpanded: true,
				replyOpen: false, replyDraft: '', replyError: null, cardEl: null,
			});
			resolveAll();
			repaintHighlights();
			updateToggleBtn();
			closeSheet();
			renderMargin();
		} catch (e) {
			draft.posting = false;
			draft.error = "couldn't post — try again";
			draft.text = values.text;
			draft.name = values.name;
			renderMargin();
			renderSheetIfOpen();
		}
	}

	async function submitReply(t, values) {
		if (!values.text.trim() || t.replyPosting) return;
		t.replyPosting = true;
		t.replyError = null;
		renderMargin();
		renderSheetIfOpen();
		try {
			const { comment } = await postComment({
				post: slug,
				parentId: t.id,
				text: values.text,
				name: values.name,
				honeypot: values.honeypot,
				asAuthor: values.asAuthor,
			});
			rememberName(values.name);
			t.replies.push(comment);
			t.replyOpen = false;
			t.replyDraft = '';
			t.replyPosting = false;
			state.total++;
			updateToggleBtn();
			renderMargin();
			renderSheetIfOpen();
		} catch (e) {
			t.replyPosting = false;
			t.replyError = "couldn't post — try again";
			t.replyDraft = values.text;
			renderMargin();
			renderSheetIfOpen();
		}
	}

	/* ---------- author moderation ---------- */

	async function refetch() {
		try {
			const data = await api(`/v1/comments?post=${slug}`);
			state.total = data.total;
			state.truncated = data.truncated;
			const open = new Map(state.threads.map((t) => [t.id, t]));
			state.threads = buildThreads(data.comments);
			for (const t of state.threads) {
				const prev = open.get(t.id);
				if (prev) {
					t.replyOpen = prev.replyOpen;
					t.replyDraft = prev.replyDraft;
					t.userExpanded = prev.userExpanded;
				}
			}
			resolveAll();
			repaintHighlights();
			updateToggleBtn();
			renderMargin();
			closeSheet();
		} catch { /* keep stale state */ }
	}

	async function authorAction(path, options) {
		try {
			await api(path, { ...options, auth: true });
			await refetch();
		} catch (e) {
			if (e.status === 401) {
				state.passphrase = null;
				storage.remove('annotations:author');
				renderMargin();
			}
		}
	}

	/* ---------- thread content (shared: margin card + bottom sheet) ---------- */

	function buildCommentBlock(t, item, { isReply }) {
		const block = el('div', 'ann-comment' + (isReply ? ' ann-is-reply' : ''));
		block.id = `comment-${item.id}`;
		if (item.deleted) {
			block.appendChild(el('span', 'ann-tombstone', '[deleted]'));
			return block;
		}
		const meta = el('div', 'ann-meta');
		meta.appendChild(el('span', 'ann-name', item.isAuthor ? 'David' : item.name || `#${item.number}`));
		if (item.isAuthor) meta.appendChild(el('span', 'ann-badge', 'Author'));
		if (item.createdAt) {
			const d = new Date(item.createdAt);
			if (!isNaN(d)) {
				meta.appendChild(el('span', 'ann-date',
					d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })));
			}
		}
		block.appendChild(meta);
		block.appendChild(el('p', 'ann-body', item.body));

		if (state.passphrase) {
			const row = el('div', 'ann-author-row');
			const delBtn = el('button', 'ann-link-btn', 'Delete');
			delBtn.type = 'button';
			delBtn.addEventListener('click', () => authorAction(`/v1/comments/${item.id}`, { method: 'DELETE' }));
			row.appendChild(delBtn);
			if (!isReply) {
				const delThread = el('button', 'ann-link-btn', 'Delete thread');
				delThread.type = 'button';
				delThread.addEventListener('click', () => authorAction(`/v1/comments/${item.id}?thread=1`, { method: 'DELETE' }));
				row.appendChild(delThread);
				const hide = el('button', 'ann-link-btn', 'Hide thread');
				hide.type = 'button';
				hide.addEventListener('click', () => authorAction(`/v1/comments/${item.id}/hide`, { method: 'POST' }));
				row.appendChild(hide);
			}
			block.appendChild(row);
		}
		return block;
	}

	function buildThreadContent(t, { inSheet }) {
		const frag = document.createDocumentFragment();
		frag.appendChild(buildCommentBlock(t, t.root, { isReply: false }));
		for (const reply of t.replies) {
			frag.appendChild(buildCommentBlock(t, reply, { isReply: true }));
		}

		const actions = el('div', 'ann-actions');
		const replyBtn = el('button', 'ann-link-btn', 'Reply');
		replyBtn.type = 'button';
		replyBtn.addEventListener('click', () => {
			t.replyOpen = !t.replyOpen;
			renderMargin();
			renderSheetIfOpen();
			requestAnimationFrame(() => {
				const ta = (inSheet ? sheetEl : t.cardEl)?.querySelector('.ann-compose textarea');
				if (ta) ta.focus();
			});
		});
		actions.appendChild(replyBtn);

		if (!inSheet) {
			const collapseBtn = el('button', 'ann-link-btn', 'Collapse');
			collapseBtn.type = 'button';
			collapseBtn.addEventListener('click', () => {
				t.userCollapsed = true;
				t.userExpanded = false;
				storage.set(`annotations:collapsed:${t.id}`, '1');
				renderMargin();
			});
			actions.appendChild(collapseBtn);
		}
		frag.appendChild(actions);

		if (t.replyOpen) {
			frag.appendChild(buildCompose({
				draftText: t.replyDraft,
				draftName: state.savedName,
				error: t.replyError,
				posting: t.replyPosting,
				onInput: (v) => { t.replyDraft = v; },
				onNameInput: (v) => { state.savedName = v; },
				onPost: (values) => submitReply(t, values),
				onCancel: () => { t.replyOpen = false; renderMargin(); renderSheetIfOpen(); },
			}));
		}
		return frag;
	}

	/* ---------- margin rendering (desktop) ---------- */

	const cardEls = [];

	function clearCards() {
		for (const c of cardEls) c.remove();
		cardEls.length = 0;
		if (orphanLabelEl) { orphanLabelEl.remove(); orphanLabelEl = null; }
		for (const t of state.threads) t.cardEl = null;
		column.style.minHeight = '';
	}

	// Full margin render: re-evaluate auto-collapse from scratch (it's a
	// layout outcome, not persisted), build cards, then run the layout loop.
	function renderMargin() {
		for (const t of state.threads) t.autoCollapsed = false;
		buildCards();
		runLayout();
	}

	function buildCards() {
		clearCards();
		if (!state.enabled || !mqDesktop.matches) {
			return;
		}

		for (const t of state.threads) {
			if (t.hidden) {
				const stub = el('div', 'annotation-compact ann-stub', 'thread hidden by author');
				if (state.passphrase) {
					stub.textContent = 'thread hidden by author · ';
					const unhide = el('button', 'ann-link-btn', 'Unhide');
					unhide.type = 'button';
					unhide.addEventListener('click', () => authorAction(`/v1/comments/${t.id}/unhide`, { method: 'POST' }));
					stub.appendChild(unhide);
				}
				t.cardEl = stub;
				column.appendChild(stub);
				cardEls.push(stub);
				continue;
			}
			const collapsed = (t.userCollapsed || t.autoCollapsed) && !t.userExpanded;
			if (collapsed) {
				const box = el('button', 'annotation-compact');
				box.type = 'button';
				const n = visibleCount(t);
				box.textContent = `${threadLabel(t)} · ${n} comment${n === 1 ? '' : 's'}`;
				box.addEventListener('click', () => expandThread(t));
				t.cardEl = box;
				column.appendChild(box);
				cardEls.push(box);
			} else {
				const card = el('div', 'annotation-card');
				card.appendChild(buildThreadContent(t, { inSheet: false }));
				card.addEventListener('mouseenter', () => setActiveThread(t.id));
				card.addEventListener('mouseleave', () => setActiveThread(null));
				if (t.id === state.activeThreadId) card.classList.add('focused');
				t.cardEl = card;
				column.appendChild(card);
				cardEls.push(card);
			}
		}

		// Compose card for a new top-level comment
		if (state.draft && state.draft.open) {
			const card = el('div', 'annotation-card');
			card.appendChild(el('div', 'ann-name', 'New comment'));
			card.appendChild(buildCompose({
				draftText: state.draft.text,
				draftName: state.draft.name != null ? state.draft.name : state.savedName,
				error: state.draft.error,
				posting: state.draft.posting,
				onInput: (v) => { state.draft.text = v; },
				onNameInput: (v) => { state.draft.name = v; },
				onPost: (values) => submitNewThread(values),
				onCancel: () => { state.draft.open = false; repaintHighlights(); renderMargin(); },
			}));
			card._isCompose = true;
			column.appendChild(card);
			cardEls.push(card);
		}
	}

	function expandThread(t) {
		t.userExpanded = true;
		t.userCollapsed = false;
		t.autoCollapsed = false;
		storage.remove(`annotations:collapsed:${t.id}`);
		renderMargin();
	}

	let orphanLabelEl = null;

	function cardProvider({ gridRect, colOffsetTop }) {
		const items = [];
		const anchorTopOf = (range) => {
			const r = range.getBoundingClientRect();
			return r.top - gridRect.top - colOffsetTop;
		};
		let hasOrphans = false;
		for (const t of state.threads) {
			if (!t.cardEl) continue;
			if (t.range) items.push({ el: t.cardEl, anchorTop: anchorTopOf(t.range), thread: t });
			else { hasOrphans = true; }
		}
		if (orphanLabelEl) { orphanLabelEl.remove(); orphanLabelEl = null; }
		if (hasOrphans) {
			orphanLabelEl = el('div', 'ann-orphan-label', 'On changed text');
			column.appendChild(orphanLabelEl);
			items.push({ el: orphanLabelEl, orphan: true });
			for (const t of state.threads) {
				if (t.cardEl && !t.range) items.push({ el: t.cardEl, anchorTop: 0, orphan: true });
			}
		}
		const composeCard = cardEls.find((c) => c._isCompose);
		if (composeCard && state.draft) {
			if (state.draft.range) items.push({ el: composeCard, anchorTop: anchorTopOf(state.draft.range) });
			else items.push({ el: composeCard, orphan: true });
		}
		return items;
	}

	// Auto-collapse loop: if a card lands too far below its highlight
	// (crowded sidenote stretch), render it compact instead — never
	// persisted; the user may still expand it.
	function runLayout() {
		for (let i = 0; i < 10; i++) {
			const placements = layoutMargin();
			let changed = false;
			for (const p of placements) {
				const t = state.threads.find((th) => th.cardEl === p.el);
				if (!t) continue;
				const expanded = t.cardEl.classList.contains('annotation-card');
				if (expanded && !t.userExpanded && !t.hidden && p.displacement > AUTO_COLLAPSE_DISPLACEMENT) {
					t.autoCollapsed = true;
					changed = true;
				}
			}
			if (!changed) return;
			buildCards(); // rebuild with newly collapsed threads, then lay out again
		}
	}

	/* ---------- selection toolbar ---------- */

	let toolbarEl = null;
	let pendingSelection = null; // { anchor, start }

	function hideToolbar() {
		if (toolbarEl) toolbarEl.remove();
		toolbarEl = null;
		pendingSelection = null;
	}

	function checkSelection() {
		if (!state.enabled || !state.index) return hideToolbar();
		const sel = window.getSelection();
		if (!sel || sel.isCollapsed || sel.rangeCount === 0) return hideToolbar();
		const range = sel.getRangeAt(0);
		const { startContainer, endContainer } = range;
		if (!prose.contains(startContainer) || !prose.contains(endContainer)) return hideToolbar();
		const inSidenote = (node) => {
			const elNode = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
			return elNode && elNode.closest('.sidenote, .sidenote-ref');
		};
		if (inSidenote(startContainer) || inSidenote(endContainer)) return hideToolbar();

		const start = pointToOffset(startContainer, range.startOffset);
		const end = pointToOffset(endContainer, range.endOffset);
		if (start == null || end == null || end <= start) return hideToolbar();
		const exact = state.index.text.slice(start, end);
		if (exact.trim().length === 0 || exact.length > MAX_SELECTION) return hideToolbar();

		pendingSelection = {
			start,
			anchor: {
				exact,
				prefix: state.index.text.slice(Math.max(0, start - CONTEXT_CHARS), start),
				suffix: state.index.text.slice(end, end + CONTEXT_CHARS),
				charOffset: start,
			},
		};

		if (!toolbarEl) {
			toolbarEl = el('button', 'annotation-toolbar', '\u{1F4AC} Comment');
			toolbarEl.type = 'button';
			// mousedown so the click doesn't clear the selection first
			toolbarEl.addEventListener('mousedown', (e) => e.preventDefault());
			toolbarEl.addEventListener('click', startCompose);
			document.body.appendChild(toolbarEl);
		}
		const rect = range.getBoundingClientRect();
		const top = Math.min(Math.max(8, rect.top - 38), window.innerHeight - 48);
		const left = Math.min(Math.max(8, rect.left + rect.width / 2 - 50), window.innerWidth - 120);
		toolbarEl.style.top = top + 'px';
		toolbarEl.style.left = left + 'px';
	}

	function startCompose() {
		if (!pendingSelection) return;
		const prevText = state.draft ? state.draft.text : '';
		state.draft = {
			anchor: pendingSelection.anchor,
			start: pendingSelection.start,
			range: rangeForSpan(pendingSelection.start, pendingSelection.anchor.exact.length),
			text: prevText,
			name: state.savedName,
			open: true,
			error: null,
			posting: false,
		};
		hideToolbar();
		try { window.getSelection().removeAllRanges(); } catch { /* ignore */ }
		repaintHighlights();
		if (mqDesktop.matches) {
			renderMargin();
			requestAnimationFrame(() => {
				const card = cardEls.find((c) => c._isCompose);
				const ta = card && card.querySelector('textarea');
				if (ta) ta.focus();
			});
		} else {
			openSheet(null, { compose: true });
		}
	}

	let selectionTimer = null;
	document.addEventListener('selectionchange', () => {
		clearTimeout(selectionTimer);
		selectionTimer = setTimeout(checkSelection, 200);
	});

	// Esc / click-away closes an open compose box; the typed draft is kept
	// until page unload and restored on the next compose.
	function dismissCompose() {
		if (!state.draft || !state.draft.open) return;
		state.draft.open = false;
		repaintHighlights();
		renderMargin();
		if (sheetComposeMode) closeSheet();
	}

	document.addEventListener('keydown', (e) => {
		if (e.key === 'Escape') dismissCompose();
	});
	document.addEventListener('click', (e) => {
		if (!state.draft || !state.draft.open || !mqDesktop.matches) return;
		const composeCard = cardEls.find((c) => c._isCompose);
		if (!composeCard) return;
		if (composeCard.contains(e.target)) return;
		// The toolbar is removed from the DOM before this bubbles up, so test
		// the target's class rather than the (now-null) toolbar element. The
		// global toggle must never destroy the draft (spec: off→on restores it).
		if (e.target instanceof Element &&
			e.target.closest('.annotation-toolbar, .annotations-toggle, .annotation-sheet')) return;
		dismissCompose();
	});

	/* ---------- highlight click → focus card / open sheet ---------- */

	function offsetFromPoint(x, y) {
		if (!state.index) return null;
		let node = null, off = 0;
		if (document.caretPositionFromPoint) {
			const pos = document.caretPositionFromPoint(x, y);
			if (pos) { node = pos.offsetNode; off = pos.offset; }
		} else if (document.caretRangeFromPoint) {
			const r = document.caretRangeFromPoint(x, y);
			if (r) { node = r.startContainer; off = r.startOffset; }
		}
		if (!node || !prose.contains(node)) return null;
		return pointToOffset(node, off);
	}

	document.addEventListener('click', (e) => {
		if (!state.enabled || !highlightsSupported) return;
		const sel = window.getSelection();
		if (sel && !sel.isCollapsed) return;
		if (!(e.target instanceof Element) || !prose.contains(e.target)) return;
		if (e.target.closest('a, button, label, input')) return;
		const offset = offsetFromPoint(e.clientX, e.clientY);
		if (offset == null) return;
		const t = state.threads.find(
			(th) => th.start != null && offset >= th.start && offset < th.start + th.root.anchor.exact.length
		);
		if (!t) return;
		if (mqDesktop.matches) {
			if ((t.userCollapsed || t.autoCollapsed) && !t.userExpanded) {
				expandThread(t); // counts as a user expand, persisted
			}
			setActiveThread(t.id);
			if (t.cardEl) {
				t.cardEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
			}
		} else {
			openSheet(t);
		}
	});

	/* ---------- mobile bottom sheet ---------- */

	let sheetEl = null;
	let sheetBackdropEl = null;
	let sheetThread = null;
	let sheetComposeMode = false;

	function closeSheet() {
		if (sheetEl) sheetEl.remove();
		if (sheetBackdropEl) sheetBackdropEl.remove();
		sheetEl = sheetBackdropEl = null;
		sheetThread = null;
		sheetComposeMode = false;
		setActiveThread(null);
	}

	function openSheet(t, { compose = false } = {}) {
		closeSheet();
		sheetThread = t;
		sheetComposeMode = compose;
		sheetBackdropEl = el('div', 'ann-sheet-backdrop');
		sheetBackdropEl.addEventListener('click', closeSheet);
		document.body.appendChild(sheetBackdropEl);
		sheetEl = el('div', 'annotation-sheet');
		document.body.appendChild(sheetEl);
		renderSheet();
		if (t) setActiveThread(t.id);
	}

	function renderSheet() {
		if (!sheetEl) return;
		sheetEl.textContent = '';
		const close = el('button', 'ann-sheet-close', '×');
		close.type = 'button';
		close.setAttribute('aria-label', 'Close');
		close.addEventListener('click', closeSheet);
		sheetEl.appendChild(close);

		if (sheetComposeMode && state.draft) {
			sheetEl.appendChild(el('div', 'ann-name', 'New comment'));
			sheetEl.appendChild(buildCompose({
				draftText: state.draft.text,
				draftName: state.draft.name != null ? state.draft.name : state.savedName,
				error: state.draft.error,
				posting: state.draft.posting,
				onInput: (v) => { state.draft.text = v; },
				onNameInput: (v) => { state.draft.name = v; },
				onPost: (values) => submitNewThread(values),
				onCancel: () => { state.draft.open = false; repaintHighlights(); closeSheet(); },
			}));
		} else if (sheetThread) {
			sheetEl.appendChild(buildThreadContent(sheetThread, { inSheet: true }));
		}
	}

	function renderSheetIfOpen() {
		if (sheetEl) renderSheet();
	}

	/* ---------- author mode entry (#author) ---------- */

	function maybePromptAuthor() {
		if (location.hash !== '#author' || state.passphrase) return;
		if (document.querySelector('.ann-prompt')) return;
		const prompt = el('div', 'ann-prompt');
		const label = el('label', null, 'Author passphrase');
		label.htmlFor = 'ann-passphrase';
		const input = el('input');
		input.type = 'password';
		input.id = 'ann-passphrase';
		const btn = el('button', 'ann-post-btn', 'Enter');
		btn.type = 'button';
		const error = el('div', 'ann-error', '');
		const submit = async () => {
			const value = input.value;
			if (!value) return;
			try {
				await fetch(API_BASE + '/v1/author/login', {
					method: 'POST',
					headers: { Authorization: `Bearer ${value}` },
				}).then((r) => { if (!r.ok) throw new Error(); });
				state.passphrase = value;
				storage.set('annotations:author', value);
				prompt.remove();
				history.replaceState(null, '', location.pathname + location.search);
				renderMargin();
				renderSheetIfOpen();
			} catch {
				error.textContent = 'wrong passphrase';
			}
		};
		btn.addEventListener('click', submit);
		input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
		prompt.appendChild(label);
		prompt.appendChild(input);
		prompt.appendChild(btn);
		prompt.appendChild(error);
		document.body.appendChild(prompt);
		input.focus();
	}

	/* ---------- breakpoint & resize ----------
	   BlogPost.astro's sidenote script registers its own listener on the same
	   media query FIRST (it inits before this module), so sidenotes have been
	   re-homed by the time we re-resolve and repaint. */

	mqDesktop.addEventListener('change', () => {
		requestAnimationFrame(() => {
			closeSheet();
			resolveAll();
			repaintHighlights();
			renderMargin();
		});
	});
	window.addEventListener('resize', () => {
		if (mqDesktop.matches && state.enabled) requestAnimationFrame(() => layoutMargin());
	});

	/* ---------- deep link (#comment-<id>) ---------- */

	function maybeScrollToComment() {
		const m = location.hash.match(/^#comment-([0-9a-fA-F-]+)$/);
		if (!m) return;
		const id = m[1];
		const t = state.threads.find((th) => th.id === id || th.replies.some((r) => r.id === id));
		if (!t || t.hidden) return;
		if (mqDesktop.matches) {
			if ((t.userCollapsed || t.autoCollapsed) && !t.userExpanded) expandThread(t);
			setActiveThread(t.id);
			requestAnimationFrame(() => {
				if (t.cardEl) t.cardEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
			});
		} else {
			openSheet(t);
		}
	}

	/* ---------- init ---------- */

	setCardProvider(cardProvider);

	(async () => {
		let data;
		try {
			data = await api(`/v1/comments?post=${slug}`);
		} catch {
			return; // API unreachable: feature is a no-op, page pristine
		}
		state.total = data.total;
		state.truncated = data.truncated;
		state.threads = buildThreads(data.comments);
		resolveAll();
		createToggleBtn();
		repaintHighlights();
		renderMargin();
		maybePromptAuthor();
		maybeScrollToComment();
		// #author can also arrive via same-document navigation
		window.addEventListener('hashchange', maybePromptAuthor);
	})();
}
