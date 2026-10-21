-- YouTube likes per view at fetch time: a small quality signal.
ALTER TABLE videos ADD COLUMN like_ratio REAL;

-- Hand-picked creators no longer get a fixed 0.85: Claude scores them like everyone else. 0.7 until then.
UPDATE channels SET score = 0.7, reason = 'Curated (to score)' WHERE reason = 'Curated';

-- Stand-up comedy: fun that still has craft.
INSERT INTO topics (name, mode, query_en, query_hi, long_videos) VALUES
  ('Stand-up comedy', 'unwind', 'stand up comedy', 'स्टैंड अप कॉमेडी', 1);

INSERT OR IGNORE INTO channels (id, title, topic_id, thumb, score, reason, status, uploads_playlist, discovered_at) VALUES
  ('UCkS7Vxu4PjM99w0Is6idjcg', 'Zakir Khan', (SELECT id FROM topics WHERE name = 'Stand-up comedy'), 'https://yt3.ggpht.com/ytc/AIdro_n1IJy85RjuuYiZphsaRQnSeF1v6numV9-5Tn--R5NMvcQ=s88-c-k-c0x00ffffff-no-rj', 0.7, 'Curated (to score)', 'active', 'UUkS7Vxu4PjM99w0Is6idjcg', 0),
  ('UCKnZHF24IV9PT0cdSdHoWug', 'Anubhav Singh Bassi', (SELECT id FROM topics WHERE name = 'Stand-up comedy'), 'https://yt3.ggpht.com/ytc/AIdro_mRNlFKz0e9nYU4KLK6jPSljNauspzslczyHmcwC73ZDR0=s88-c-k-c0x00ffffff-no-rj', 0.7, 'Curated (to score)', 'active', 'UUKnZHF24IV9PT0cdSdHoWug', 0),
  ('UCzNq9i-DlDDBLjPerVzJW-A', 'Kenny Sebastian', (SELECT id FROM topics WHERE name = 'Stand-up comedy'), 'https://yt3.ggpht.com/r7w6jxrrjjuU0TykTBkhTIbQ9JR9wpFuQ_Vg5VTCWTF2ZkOHlQEB6wl5WpTfmNgc-3c3TyiK=s88-c-k-c0x00ffffff-no-rj', 0.7, 'Curated (to score)', 'active', 'UUzNq9i-DlDDBLjPerVzJW-A', 0),
  ('UCvgMH5bd8JU_3KZ0BnBL4Vg', 'Rahul Subramanian', (SELECT id FROM topics WHERE name = 'Stand-up comedy'), 'https://yt3.ggpht.com/bxVxic_WY1hs-8eT-1F0UyF4I8ihMVt5RIxZ_KUWGo2ESBwI_xvBG7mreIHfYAprretXZm261M0=s88-c-k-c0x00ffffff-no-rj', 0.7, 'Curated (to score)', 'active', 'UUvgMH5bd8JU_3KZ0BnBL4Vg', 0),
  ('UCAov2BBv1ZJav0c_yHEciAw', 'Samay Raina', (SELECT id FROM topics WHERE name = 'Stand-up comedy'), 'https://yt3.ggpht.com/Wa_kc-EY0nzEj6c54uxm4kHnoNEpAdfM_Gd3QOgT-eLBohn0QiL6KRDdn5uWmF1nBhJty5y4=s88-c-k-c0x00ffffff-no-rj', 0.7, 'Curated (to score)', 'active', 'UUAov2BBv1ZJav0c_yHEciAw', 0),
  ('UCObk_g1hQBy0RKKriVX_zOQ', 'Netflix Is A Joke', (SELECT id FROM topics WHERE name = 'Stand-up comedy'), 'https://yt3.ggpht.com/3CYVzLztKZ_nGzrs6UTXwKr5W-RUe5uIUuJoHno6HgUVj-KpbJ8_u-6MveD3k-AZXEOdWpUPSw=s88-c-k-c0x00ffffff-no-rj', 0.7, 'Curated (to score)', 'active', 'UUObk_g1hQBy0RKKriVX_zOQ', 0),
  ('UCtw7q4SyOeoCwM1i_3x8lDg', 'Comedy Central Stand-Up', (SELECT id FROM topics WHERE name = 'Stand-up comedy'), 'https://yt3.ggpht.com/ytc/AIdro_nlYiEVlFNDBycMXXLPGiXyZT2Y6b2rEY9oN5WYz65q6A=s88-c-k-c0x00ffffff-no-rj', 0.7, 'Curated (to score)', 'active', 'UUtw7q4SyOeoCwM1i_3x8lDg', 0),
  ('UC4muYPMCSYigqIwRjVWkQ2Q', 'Abhishek Upmanyu', (SELECT id FROM topics WHERE name = 'Stand-up comedy'), 'https://yt3.ggpht.com/ytc/AIdro_k6F6RkEpJ7qntsElloPtcaA42bjzZDT5wq5cJhE1zcWPU=s88-c-k-c0x00ffffff-no-rj', 0.7, 'Curated (to score)', 'active', 'UU4muYPMCSYigqIwRjVWkQ2Q', 0),
  ('UCyOyIUC4bBPjNWkd5gG30TA', 'Biswa Kalyan Rath', (SELECT id FROM topics WHERE name = 'Stand-up comedy'), 'https://yt3.ggpht.com/ytc/AIdro_nL4Zms0mlHSqvn3XCTfchOp2JSJn0EYk5S9sNZVgNJiQ=s88-c-k-c0x00ffffff-no-rj', 0.7, 'Curated (to score)', 'active', 'UUyOyIUC4bBPjNWkd5gG30TA', 0);
