-- The full video a Short links to in its description, for "View full video".
ALTER TABLE videos ADD COLUMN full_id TEXT;

-- New research, explained.
INSERT INTO topics (name, mode, query_en, query_hi, long_videos) VALUES
  ('Research papers', 'learn', 'research paper explained', 'रिसर्च पेपर हिंदी में', 1);

INSERT OR IGNORE INTO feeds (id, kind, title, url, topic_id, score, reason, status, discovered_at) VALUES
  ('rss:nature', 'rss', 'Nature', 'https://www.nature.com/nature.rss', (SELECT id FROM topics WHERE name = 'Research papers'), 0.9, 'Curated', 'active', 0),
  ('rss:science', 'rss', 'Science', 'https://www.science.org/rss/news_current.xml', (SELECT id FROM topics WHERE name = 'Research papers'), 0.9, 'Curated', 'active', 0),
  ('rss:physorg', 'rss', 'Phys.org', 'https://phys.org/rss-feed/', (SELECT id FROM topics WHERE name = 'Research papers'), 0.75, 'Curated', 'active', 0),
  ('rss:medxpress', 'rss', 'Medical Xpress', 'https://medicalxpress.com/rss-feed/', (SELECT id FROM topics WHERE name = 'Research papers'), 0.75, 'Curated', 'active', 0),
  ('rss:sciencedaily', 'rss', 'ScienceDaily', 'https://www.sciencedaily.com/rss/top/science.xml', (SELECT id FROM topics WHERE name = 'Research papers'), 0.8, 'Curated', 'active', 0),
  ('rss:transmitter', 'rss', 'The Transmitter', 'https://www.thetransmitter.org/feed/', (SELECT id FROM topics WHERE name = 'Research papers'), 0.85, 'Curated', 'active', 0);

-- Creators who explain papers (subscriber counts checked 2026-10-21, all 100k+).
INSERT OR IGNORE INTO channels (id, title, topic_id, thumb, score, reason, status, uploads_playlist, discovered_at) VALUES
  ('UCbfYPyITQ-7l4upoX8nvctg', 'Two Minute Papers', (SELECT id FROM topics WHERE name = 'Research papers'), 'https://yt3.ggpht.com/ytc/AIdro_ljAkSpv16cJNUsE_rI1X-Kz9s78w1WNojUga-aZ1uVzEQ=s88-c-k-c0x00ffffff-no-rj', 0.85, 'Curated', 'active', 'UUbfYPyITQ-7l4upoX8nvctg', 0),
  ('UCZHmQk67mSJgfCCTn7xBfew', 'Yannic Kilcher', (SELECT id FROM topics WHERE name = 'Research papers'), 'https://yt3.ggpht.com/ytc/AIdro_nqmmpWC-iPIeVF4grbJGcGmoWyYX0E6_PFGITlKv7jTMrh=s88-c-k-c0x00ffffff-no-rj', 0.85, 'Curated', 'active', 'UUZHmQk67mSJgfCCTn7xBfew', 0),
  ('UCNJ1Ymd5yFuUPtn21xtRbbw', 'AI Explained', (SELECT id FROM topics WHERE name = 'Research papers'), 'https://yt3.ggpht.com/GFuvgO3IZvs5XkYOxyLoWQto2lyY6-7Ob-7sfZRyoann4eBgvBMxuGgSVU1cvBgRCgAn41St7g=s88-c-k-c0x00ffffff-no-rj', 0.85, 'Curated', 'active', 'UUNJ1Ymd5yFuUPtn21xtRbbw', 0),
  ('UCNIkB2IeJ-6AmZv7bQ1oBYg', 'Arxiv Insights', (SELECT id FROM topics WHERE name = 'Research papers'), 'https://yt3.ggpht.com/ytc/AIdro_n6kMSCp5BBT1actmVqx5uqRdewVPK4Ye_iVK7QUPha4CU=s88-c-k-c0x00ffffff-no-rj', 0.85, 'Curated', 'active', 'UUNIkB2IeJ-6AmZv7bQ1oBYg', 0),
  ('UC1yNl2E66ZzKApQdRuTQ4tw', 'Sabine Hossenfelder', (SELECT id FROM topics WHERE name = 'Research papers'), 'https://yt3.ggpht.com/YjHzJACT7jTFzpkHRfjWxmVKeBh6_8BpvVFS4iT8fb5xwoAU4sq1SeRGUju91bDOFJo6AjQMOZA=s88-c-k-c0x00ffffff-no-rj', 0.85, 'Curated', 'active', 'UU1yNl2E66ZzKApQdRuTQ4tw', 0),
  ('UCciQ8wFcVoIIMi-lfu8-cjQ', 'Anton Petrov', (SELECT id FROM topics WHERE name = 'Research papers'), 'https://yt3.ggpht.com/ytc/AIdro_m3aDUP3WR8JgphUmCwgrbdmhahThQG93RNAKnmJEL5xU8=s88-c-k-c0x00ffffff-no-rj', 0.85, 'Curated', 'active', 'UUciQ8wFcVoIIMi-lfu8-cjQ', 0),
  ('UCYNbYGl89UUowy8oXkipC-Q', 'Dr. Becky', (SELECT id FROM topics WHERE name = 'Research papers'), 'https://yt3.ggpht.com/ytc/AIdro_maQlHgnbhwVlenxITT47DIxaXovCJPIIfKBYdKGLnt0w=s88-c-k-c0x00ffffff-no-rj', 0.85, 'Curated', 'active', 'UUYNbYGl89UUowy8oXkipC-Q', 0),
  ('UC1LpsuAUaKoMzzJSEt5WImw', 'Asianometry', (SELECT id FROM topics WHERE name = 'Research papers'), 'https://yt3.ggpht.com/t_WHWwjVFb-837gRQ-ExcsjK1q5Z4dZ-mb4I6ItI4aBo3woGH7MkO7RAKf5kiAZUa3148lgNWw=s88-c-k-c0x00ffffff-no-rj', 0.85, 'Curated', 'active', 'UU1LpsuAUaKoMzzJSEt5WImw', 0),
  ('UC7_gcs09iThXybpVgjHZ_7g', 'PBS Space Time', (SELECT id FROM topics WHERE name = 'Research papers'), 'https://yt3.ggpht.com/A7npG37dOJQffCnkUAyHI8wxnYhWA2q9SQY58AJ_bZUgKv30RtKD9sz5FQs4fs9-xWCg9S0P5jw=s88-c-k-c0x00ffffff-no-rj', 0.85, 'Curated', 'active', 'UU7_gcs09iThXybpVgjHZ_7g', 0);
