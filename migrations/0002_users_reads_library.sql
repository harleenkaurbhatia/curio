-- Accounts
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  languages TEXT NOT NULL DEFAULT 'en,hi,hinglish',
  tz_offset INTEGER NOT NULL DEFAULT 330,
  onboarded INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);

-- Shared topic catalog; each user follows some of it.
ALTER TABLE topics ADD COLUMN created_by INTEGER;
CREATE TABLE user_topics (user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, topic_id INTEGER NOT NULL REFERENCES topics(id), PRIMARY KEY (user_id, topic_id));
CREATE TABLE user_blocks (user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, source_id TEXT NOT NULL, PRIMARY KEY (user_id, source_id));

-- Per-user history (replaces single-user tables)
DROP TABLE seen;
DROP TABLE feedback;
DROP TABLE weights;
CREATE TABLE views (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,
  topic_id INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('video', 'post')),
  ms INTEGER NOT NULL DEFAULT 0,
  at INTEGER NOT NULL,
  PRIMARY KEY (user_id, item_id)
);
CREATE INDEX views_user_at ON views(user_id, at);
CREATE TABLE feedback (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  topic_id INTEGER NOT NULL,
  rating INTEGER NOT NULL CHECK (rating IN (-1, 1)),
  at INTEGER NOT NULL,
  PRIMARY KEY (user_id, item_id)
);
CREATE TABLE weights (user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, kind TEXT NOT NULL, key TEXT NOT NULL, value REAL NOT NULL, PRIMARY KEY (user_id, kind, key));

-- Library
CREATE TABLE saves (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,
  list TEXT NOT NULL CHECK (list IN ('saved', 'later')),
  snapshot TEXT NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (user_id, item_id, list)
);
CREATE TABLE notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id TEXT,
  snapshot TEXT,
  text TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX notes_user ON notes(user_id, at);

-- Text reads (shared)
CREATE TABLE feeds (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('rss', 'bsky', 'hn')),
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  topic_id INTEGER NOT NULL REFERENCES topics(id),
  thumb TEXT,
  score REAL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  meta TEXT NOT NULL DEFAULT '{}',
  discovered_at INTEGER NOT NULL,
  last_fetched_at INTEGER
);
CREATE INDEX feeds_topic ON feeds(topic_id, status);
CREATE TABLE posts (
  id TEXT PRIMARY KEY,
  feed_id TEXT NOT NULL REFERENCES feeds(id),
  topic_id INTEGER NOT NULL REFERENCES topics(id),
  title TEXT NOT NULL DEFAULT '',
  text TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL,
  image TEXT,
  author TEXT,
  published_at INTEGER NOT NULL,
  score REAL,
  hook TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ok', 'rejected')),
  added_at INTEGER NOT NULL
);
CREATE INDEX posts_status ON posts(status, published_at);
ALTER TABLE topics ADD COLUMN last_bsky_discovered_at INTEGER;

-- Curated starting feeds (all verified reachable on 2026-10-18).
INSERT INTO feeds (id, kind, title, url, topic_id, score, reason, status, discovered_at) VALUES
  ('rss:quanta', 'rss', 'Quanta Magazine', 'https://www.quantamagazine.org/feed/', 1, 0.9, 'Curated', 'active', 0),
  ('rss:nature', 'rss', 'Nature', 'https://www.nature.com/nature.rss', 1, 0.9, 'Curated', 'active', 0),
  ('rss:nobel', 'rss', 'Nobel Prize', 'https://www.nobelprize.org/feed/', 2, 0.9, 'Curated', 'active', 0),
  ('rss:bbc-world', 'rss', 'BBC World', 'https://feeds.bbci.co.uk/news/world/rss.xml', 3, 0.8, 'Curated', 'active', 0),
  ('rss:restofworld', 'rss', 'Rest of World', 'https://restofworld.org/feed/latest', 3, 0.85, 'Curated', 'active', 0),
  ('rss:thehindu', 'rss', 'The Hindu', 'https://www.thehindu.com/news/national/feeder/default.rss', 4, 0.8, 'Curated', 'active', 0),
  ('rss:ie-explained', 'rss', 'Indian Express Explained', 'https://indianexpress.com/section/explained/feed/', 4, 0.85, 'Curated', 'active', 0),
  ('rss:scroll', 'rss', 'Scroll', 'https://feeds.feedburner.com/ScrollinArticles.rss', 4, 0.8, 'Curated', 'active', 0),
  ('rss:bbc-hindi', 'rss', 'BBC Hindi', 'https://feeds.bbci.co.uk/hindi/rss.xml', 4, 0.8, 'Curated', 'active', 0),
  ('rss:psyche', 'rss', 'Psyche', 'https://psyche.co/feed', 6, 0.9, 'Curated', 'active', 0),
  ('rss:lenny', 'rss', 'Lenny''s Newsletter', 'https://www.lennysnewsletter.com/feed', 7, 0.85, 'Curated', 'active', 0),
  ('rss:inc42', 'rss', 'Inc42', 'https://inc42.com/feed/', 7, 0.75, 'Curated', 'active', 0),
  ('rss:techcrunch', 'rss', 'TechCrunch', 'https://techcrunch.com/feed/', 8, 0.75, 'Curated', 'active', 0),
  ('hn:front', 'hn', 'Hacker News', 'https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=40', 8, 0.85, 'Curated', 'active', 0),
  ('rss:aeon', 'rss', 'Aeon', 'https://aeon.co/feed.rss', 9, 0.9, 'Curated', 'active', 0);

-- search.list has its own daily bucket (100 calls) since 2026.
ALTER TABLE quota ADD COLUMN searches INTEGER NOT NULL DEFAULT 0;
