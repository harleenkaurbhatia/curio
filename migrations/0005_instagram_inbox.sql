-- Reels and posts people send you on Instagram, delivered by Meta's messages webhook.
CREATE TABLE ig_accounts (
  ig_id TEXT PRIMARY KEY,                -- Instagram professional account id (webhook entry.id)
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  username TEXT,
  token TEXT NOT NULL,                   -- long-lived Instagram user token, refreshed weekly
  token_refreshed_at INTEGER NOT NULL
);
CREATE TABLE ig_senders (ig_id TEXT PRIMARY KEY, name TEXT, username TEXT, pic TEXT, fetched_at INTEGER NOT NULL);
CREATE TABLE inbox (
  id TEXT PRIMARY KEY,                   -- message id + attachment index
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sender_ig_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('reel', 'post')),
  media_url TEXT, title TEXT, media_id TEXT, link TEXT, text TEXT,
  at INTEGER NOT NULL,
  seen INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX inbox_user ON inbox(user_id, at);
