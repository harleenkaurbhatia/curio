CREATE TABLE topics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  mode TEXT NOT NULL CHECK (mode IN ('catchup', 'learn', 'unwind')),
  query_en TEXT NOT NULL,
  query_hi TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  last_discovered_at INTEGER
);

-- status: pending (not yet scored) | active | rejected (failed quality bar) | removed (by you)
CREATE TABLE channels (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  topic_id INTEGER NOT NULL REFERENCES topics(id),
  thumb TEXT,
  language TEXT,
  score REAL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  uploads_playlist TEXT NOT NULL,
  sample_titles TEXT NOT NULL DEFAULT '[]',
  discovered_at INTEGER NOT NULL,
  last_fetched_at INTEGER
);
CREATE INDEX channels_topic ON channels(topic_id, status);

CREATE TABLE videos (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL REFERENCES channels(id),
  topic_id INTEGER NOT NULL REFERENCES topics(id),
  title TEXT NOT NULL,
  published_at INTEGER NOT NULL,
  duration_s INTEGER NOT NULL,
  added_at INTEGER NOT NULL
);
CREATE INDEX videos_published ON videos(published_at);

CREATE TABLE seen (video_id TEXT PRIMARY KEY, at INTEGER NOT NULL);

CREATE TABLE feedback (
  video_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  topic_id INTEGER NOT NULL,
  rating INTEGER NOT NULL CHECK (rating IN (-1, 1)),
  at INTEGER NOT NULL,
  PRIMARY KEY (video_id)
);

CREATE TABLE weights (kind TEXT NOT NULL, key TEXT NOT NULL, value REAL NOT NULL, PRIMARY KEY (kind, key));

CREATE TABLE quota (day TEXT PRIMARY KEY, used INTEGER NOT NULL);

INSERT INTO topics (name, mode, query_en, query_hi) VALUES
  ('Science & innovation', 'learn', 'new science discovery explained', 'विज्ञान नई खोज'),
  ('Nobel Prizes', 'learn', 'nobel prize explained', 'नोबेल पुरस्कार'),
  ('World news', 'catchup', 'world news explained', 'विश्व समाचार विश्लेषण'),
  ('India news', 'catchup', 'India news explained', 'भारत समाचार विश्लेषण'),
  ('Protests & civic movements', 'catchup', 'protest movement explained', 'आंदोलन प्रदर्शन'),
  ('Psychology', 'learn', 'psychology explained', 'मनोविज्ञान'),
  ('Founders & startups', 'learn', 'startup founder story', 'स्टार्टअप कहानी'),
  ('Tech', 'learn', 'tech news explained', 'टेक न्यूज़'),
  ('Knowledge & facts', 'learn', 'interesting facts explained', 'रोचक तथ्य'),
  ('Health basics', 'learn', 'doctor health advice', 'डॉक्टर स्वास्थ्य सलाह'),
  ('Cooking recipes', 'unwind', 'quick recipe', 'आसान रेसिपी');
