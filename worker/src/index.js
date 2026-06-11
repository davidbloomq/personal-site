/**
 * Comments API for david-bloom.com — Cloudflare Worker + D1.
 * See ../specs/annotations.md for the full spec.
 *
 * Endpoints (all JSON):
 *   GET    /v1/comments?post=<slug>      visible comments + numbers for a post
 *   POST   /v1/comments                  create comment or reply
 *   POST   /v1/author/login              verify passphrase
 *   DELETE /v1/comments/:id[?thread=1]   soft-delete a comment (or whole thread)
 *   POST   /v1/comments/:id/hide         hide a thread (server-side, everyone)
 *   POST   /v1/comments/:id/unhide       unhide a thread
 */

const SLUG_RE = /^[a-z0-9-]{1,128}$/;
const MAX_BODY = 4000;
const MAX_NAME = 40;
const MAX_EXACT = 1000;
const MAX_CONTEXT = 64;
const MAX_REQUEST_BYTES = 16 * 1024;
const MAX_COMMENTS_PER_POST = 500;
const DAILY_LIMIT = 50;

export default {
	async fetch(request, env, ctx) {
		const url = new URL(request.url);
		const cors = corsHeaders(request, env);

		if (request.method === 'OPTIONS') {
			return new Response(null, { status: 204, headers: cors });
		}

		try {
			const res = await route(request, url, env, ctx);
			for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
			return res;
		} catch (err) {
			console.error(err);
			return json({ error: 'internal error' }, 500, cors);
		}
	},
};

async function route(request, url, env, ctx) {
	const { pathname } = url;
	const method = request.method;

	if (pathname === '/v1/comments' && method === 'GET') {
		return getComments(url, env);
	}
	if (pathname === '/v1/comments' && method === 'POST') {
		return createComment(request, env, ctx);
	}
	if (pathname === '/v1/author/login' && method === 'POST') {
		return authorLogin(request, env);
	}

	const idMatch = pathname.match(/^\/v1\/comments\/([0-9a-fA-F-]{1,64})(\/hide|\/unhide)?$/);
	if (idMatch) {
		const [, id, action] = idMatch;
		if (!action && method === 'DELETE') {
			return deleteComment(request, url, env, id);
		}
		if (action && method === 'POST') {
			return setHidden(request, env, id, action === '/hide' ? 1 : 0);
		}
	}

	return json({ error: 'not found' }, 404);
}

/* ---------- CORS ---------- */

function corsHeaders(request, env) {
	const origin = request.headers.get('Origin') || '';
	const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim());
	// Any localhost origin is fine: only software on the visitor's own machine
	// can claim it, and it keeps local dev working regardless of port.
	const isLocal = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
	const headers = {
		'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
		'Access-Control-Allow-Headers': 'Content-Type, Authorization',
		'Access-Control-Max-Age': '86400',
		'Vary': 'Origin',
	};
	if (allowed.includes(origin) || isLocal) headers['Access-Control-Allow-Origin'] = origin;
	return headers;
}

/* ---------- Helpers ---------- */

function json(data, status = 200, extraHeaders = {}) {
	return new Response(JSON.stringify(data), {
		status,
		headers: { 'Content-Type': 'application/json', ...extraHeaders },
	});
}

function clientIp(request) {
	return request.headers.get('CF-Connecting-IP') || '0.0.0.0';
}

async function hashIp(ip, env) {
	const keyData = new TextEncoder().encode(env.IP_HASH_KEY || 'dev-only-ip-hash-key');
	const key = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
	const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(ip));
	return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Constant-time string comparison: compare SHA-256 digests so length is
// uniform and the loop is data-independent.
async function safeEqual(a, b) {
	const enc = new TextEncoder();
	const [da, db] = await Promise.all([
		crypto.subtle.digest('SHA-256', enc.encode(a)),
		crypto.subtle.digest('SHA-256', enc.encode(b)),
	]);
	const ua = new Uint8Array(da);
	const ub = new Uint8Array(db);
	let diff = 0;
	for (let i = 0; i < ua.length; i++) diff |= ua[i] ^ ub[i];
	return diff === 0;
}

async function isAuthorRequest(request, env) {
	if (!env.AUTHOR_PASSPHRASE) return false;
	const auth = request.headers.get('Authorization') || '';
	if (!auth.startsWith('Bearer ')) return false;
	return safeEqual(auth.slice(7), env.AUTHOR_PASSPHRASE);
}

// Per-minute limit via the ratelimits binding (per-location counters; absent
// binding — e.g. some local setups — fails open, the D1 daily cap still holds).
async function rateLimited(env, key) {
	if (!env.RATE_LIMITER) return false;
	try {
		const { success } = await env.RATE_LIMITER.limit({ key });
		return !success;
	} catch {
		return false;
	}
}

async function readJsonBody(request) {
	const len = parseInt(request.headers.get('Content-Length') || '0', 10);
	if (len > MAX_REQUEST_BYTES) return { error: 'request too large' };
	const text = await request.text();
	if (text.length > MAX_REQUEST_BYTES) return { error: 'request too large' };
	try {
		return { body: JSON.parse(text) };
	} catch {
		return { error: 'invalid JSON' };
	}
}

/* ---------- GET /v1/comments ---------- */

function rowToItem(row) {
	return {
		id: row.id,
		parentId: row.parent_id,
		anchor: row.anchor_json ? JSON.parse(row.anchor_json) : null,
		body: row.body,
		name: row.display_name,
		number: row.number ?? null,
		isAuthor: !!row.is_author,
		createdAt: row.created_at,
	};
}

async function getComments(url, env) {
	const slug = url.searchParams.get('post') || '';
	if (!SLUG_RE.test(slug)) return json({ error: 'bad post slug' }, 400);

	const { results } = await env.DB.prepare(
		`SELECT c.*, n.number FROM comments c
		 LEFT JOIN commenter_numbers n
		   ON n.post_slug = c.post_slug AND n.commenter_key = c.commenter_key
		 WHERE c.post_slug = ?
		 ORDER BY c.created_at, c.id
		 LIMIT ?`,
		).bind(slug, MAX_COMMENTS_PER_POST + 1).all();

	const truncated = results.length > MAX_COMMENTS_PER_POST;
	const rows = truncated ? results.slice(0, MAX_COMMENTS_PER_POST) : results;

	const byId = new Map(rows.map((r) => [r.id, r]));
	const children = new Map();
	for (const r of rows) {
		if (r.parent_id) {
			if (!children.has(r.parent_id)) children.set(r.parent_id, []);
			children.get(r.parent_id).push(r);
		}
	}

	// hidden is set on thread roots; a reply is hidden iff its root is.
	function rootOf(row) {
		let cur = row;
		while (cur.parent_id && byId.has(cur.parent_id)) cur = byId.get(cur.parent_id);
		return cur;
	}
	function hasLiveDescendant(row) {
		for (const child of children.get(row.id) || []) {
			if (!child.deleted || hasLiveDescendant(child)) return true;
		}
		return false;
	}

	const comments = [];
	let total = 0;
	for (const row of rows) {
		const hidden = !!rootOf(row).hidden;
		if (hidden) {
			// Stub for the top-level comment only; replies in hidden threads are omitted.
			if (!row.parent_id) comments.push({ id: row.id, hidden: true });
			continue;
		}
		if (row.deleted) {
			if (hasLiveDescendant(row)) {
				const tombstone = { id: row.id, parentId: row.parent_id, deleted: true };
				// Top-level tombstones keep their anchor so the surviving thread keeps its highlight.
				if (!row.parent_id && row.anchor_json) tombstone.anchor = JSON.parse(row.anchor_json);
				comments.push(tombstone);
			}
			continue;
		}
		comments.push(rowToItem(row));
		total++;
	}

	return json({ comments, total, truncated });
}

/* ---------- POST /v1/comments ---------- */

function validateAnchor(anchor) {
	if (typeof anchor !== 'object' || anchor === null) return 'anchor must be an object';
	const { exact, prefix, suffix, charOffset } = anchor;
	if (typeof exact !== 'string' || exact.trim().length === 0 || exact.length > MAX_EXACT)
		return 'bad anchor.exact';
	if (typeof prefix !== 'string' || prefix.length > MAX_CONTEXT) return 'bad anchor.prefix';
	if (typeof suffix !== 'string' || suffix.length > MAX_CONTEXT) return 'bad anchor.suffix';
	if (typeof charOffset !== 'number' || !Number.isFinite(charOffset) || charOffset < 0)
		return 'bad anchor.charOffset';
	return null;
}

async function createComment(request, env, ctx) {
	const { body: payload, error } = await readJsonBody(request);
	if (error) return json({ error }, 400);

	const { post, parentId, anchor, body, name, commenterKey, author, website } = payload;

	// Honeypot: bots that fill the hidden field get a plausible 200; nothing is stored.
	if (typeof website === 'string' && website.length > 0) {
		return json({ comment: { id: crypto.randomUUID(), parentId: parentId || null, createdAt: new Date().toISOString() } }, 200);
	}

	if (typeof post !== 'string' || !SLUG_RE.test(post)) return json({ error: 'bad post slug' }, 400);
	if (typeof body !== 'string' || body.trim().length === 0) return json({ error: 'empty body' }, 400);
	if (body.length > MAX_BODY) return json({ error: 'body too long' }, 400);
	if (name != null && (typeof name !== 'string' || name.length > MAX_NAME)) return json({ error: 'bad name' }, 400);
	if (typeof commenterKey !== 'string' || !/^[0-9a-f]{8,64}$/.test(commenterKey))
		return json({ error: 'bad commenterKey' }, 400);
	if (parentId != null && typeof parentId !== 'string') return json({ error: 'bad parentId' }, 400);

	// anchor required iff top-level
	if (!parentId) {
		const anchorError = validateAnchor(anchor);
		if (anchorError) return json({ error: anchorError }, 400);
	} else if (anchor != null) {
		return json({ error: 'replies must not carry an anchor' }, 400);
	}

	let isAuthor = false;
	if (author === true) {
		if (!(await isAuthorRequest(request, env))) return json({ error: 'unauthorized' }, 401);
		isAuthor = true;
	}

	const ip = clientIp(request);
	if (await rateLimited(env, `comment:${ip}`)) return json({ error: 'rate limited' }, 429);
	const ipHash = await hashIp(ip, env);
	const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
	const { cnt } = await env.DB.prepare(
		'SELECT COUNT(*) AS cnt FROM comments WHERE ip_hash = ? AND created_at > ?'
	).bind(ipHash, dayAgo).first();
	if (cnt >= DAILY_LIMIT) return json({ error: 'daily limit reached' }, 429);

	if (parentId) {
		const parent = await env.DB.prepare('SELECT * FROM comments WHERE id = ?').bind(parentId).first();
		if (!parent || parent.post_slug !== post || parent.deleted) return json({ error: 'parent not found' }, 404);
		const root = await rootRow(env, parent);
		if (root.hidden) return json({ error: 'thread hidden' }, 403);
	}

	// Assign a per-post number on this key's first comment (single statement;
	// the UNIQUE constraint is the backstop on a concurrent race — retry once).
	const assign = env.DB.prepare(
		`INSERT OR IGNORE INTO commenter_numbers (post_slug, commenter_key, number)
		 VALUES (?1, ?2, (SELECT COALESCE(MAX(number), 0) + 1 FROM commenter_numbers WHERE post_slug = ?1))`
	).bind(post, commenterKey);
	try {
		await assign.run();
	} catch {
		await assign.run();
	}
	const { number } = await env.DB.prepare(
		'SELECT number FROM commenter_numbers WHERE post_slug = ? AND commenter_key = ?'
	).bind(post, commenterKey).first();

	const id = crypto.randomUUID();
	const createdAt = new Date().toISOString();
	const trimmedName = name ? name.trim() : null;
	await env.DB.prepare(
		`INSERT INTO comments (id, post_slug, parent_id, anchor_json, body, display_name, commenter_key, ip_hash, is_author, created_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
	).bind(
		id, post, parentId || null,
		parentId ? null : JSON.stringify({ exact: anchor.exact, prefix: anchor.prefix, suffix: anchor.suffix, charOffset: anchor.charOffset }),
		body, trimmedName || null, commenterKey, ipHash, isAuthor ? 1 : 0, createdAt
	).run();

	if (!isAuthor && env.RESEND_API_KEY) {
		ctx.waitUntil(sendNotification(env, { post, id, body, name: trimmedName, number }).catch((e) => console.error('notify failed', e)));
	}

	return json({
		comment: {
			id, parentId: parentId || null,
			anchor: parentId ? null : { exact: anchor.exact, prefix: anchor.prefix, suffix: anchor.suffix, charOffset: anchor.charOffset },
			body, name: trimmedName || null, number, isAuthor, createdAt,
		},
	}, 201);
}

async function rootRow(env, row) {
	let cur = row;
	for (let depth = 0; cur.parent_id && depth < 100; depth++) {
		const parent = await env.DB.prepare('SELECT * FROM comments WHERE id = ?').bind(cur.parent_id).first();
		if (!parent) break;
		cur = parent;
	}
	return cur;
}

/* ---------- Author endpoints ---------- */

async function authorLogin(request, env) {
	const ip = clientIp(request);
	if (await rateLimited(env, `login:${ip}`)) return json({ error: 'rate limited' }, 429);
	if (!(await isAuthorRequest(request, env))) return json({ error: 'unauthorized' }, 401);
	return json({ ok: true });
}

async function deleteComment(request, url, env, id) {
	if (!(await isAuthorRequest(request, env))) return json({ error: 'unauthorized' }, 401);
	const row = await env.DB.prepare('SELECT * FROM comments WHERE id = ?').bind(id).first();
	if (!row) return json({ error: 'not found' }, 404);

	if (url.searchParams.get('thread') === '1') {
		await env.DB.prepare(
			`WITH RECURSIVE thread(id) AS (
			   SELECT id FROM comments WHERE id = ?
			   UNION ALL
			   SELECT c.id FROM comments c JOIN thread t ON c.parent_id = t.id
			 )
			 UPDATE comments SET deleted = 1 WHERE id IN (SELECT id FROM thread)`
		).bind(id).run();
	} else {
		await env.DB.prepare('UPDATE comments SET deleted = 1 WHERE id = ?').bind(id).run();
	}
	return json({ ok: true });
}

async function setHidden(request, env, id, hidden) {
	if (!(await isAuthorRequest(request, env))) return json({ error: 'unauthorized' }, 401);
	const row = await env.DB.prepare('SELECT * FROM comments WHERE id = ?').bind(id).first();
	if (!row) return json({ error: 'not found' }, 404);
	const root = await rootRow(env, row);
	await env.DB.prepare('UPDATE comments SET hidden = ? WHERE id = ?').bind(hidden, root.id).run();
	return json({ ok: true });
}

/* ---------- Email notification (Resend) ---------- */

async function sendNotification(env, { post, id, body, name, number }) {
	const who = name || `#${number}`;
	const snippet = body.length > 300 ? body.slice(0, 300) + '…' : body;
	const link = `https://david-bloom.com/essays/${post}/#comment-${id}`;
	await fetch('https://api.resend.com/emails', {
		method: 'POST',
		headers: {
			'Authorization': `Bearer ${env.RESEND_API_KEY}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			from: env.NOTIFY_FROM || 'comments@david-bloom.com',
			to: env.NOTIFY_TO || 'davidandresbloomq@gmail.com',
			subject: `New comment on "${post}" from ${who}`,
			text: `${who} commented on ${post}:\n\n${snippet}\n\n${link}`,
		}),
	});
}
