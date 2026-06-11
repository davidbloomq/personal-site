CREATE TABLE IF NOT EXISTS comments (
  id            TEXT PRIMARY KEY,          -- uuid
  post_slug     TEXT NOT NULL,             -- e.g. "grounding-of-zetetic-norms"
  parent_id     TEXT,                      -- NULL for top-level (anchored) comments
  anchor_json   TEXT,                      -- NULL for replies; TextQuoteSelector + charOffset
  body          TEXT NOT NULL,             -- plain text, max 4000 chars
  display_name  TEXT,                      -- optional, max 40 chars; NULL = anonymous
  commenter_key TEXT NOT NULL,             -- random client token; never returned by the API
  ip_hash       TEXT NOT NULL,             -- HMAC-SHA-256(secret, ip); never the raw IP
  is_author     INTEGER NOT NULL DEFAULT 0,
  hidden        INTEGER NOT NULL DEFAULT 0, -- author-hidden (thread stays, content suppressed)
  deleted       INTEGER NOT NULL DEFAULT 0, -- soft delete
  created_at    TEXT NOT NULL,             -- ISO 8601
  edited_at     TEXT                       -- ISO 8601; NULL if never edited
);
CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_slug, created_at);
CREATE INDEX IF NOT EXISTS idx_comments_ip ON comments(ip_hash, created_at);

CREATE TABLE IF NOT EXISTS commenter_numbers (
  post_slug     TEXT NOT NULL,
  commenter_key TEXT NOT NULL,
  number        INTEGER NOT NULL,          -- 1, 2, 3… per post
  PRIMARY KEY (post_slug, commenter_key),
  UNIQUE (post_slug, number)
);
