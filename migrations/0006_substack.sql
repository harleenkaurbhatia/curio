-- Substack newsletters (RSS at /feed). Paid posts only show a teaser, and screening filters those.
INSERT OR IGNORE INTO feeds (id, kind, title, url, topic_id, score, reason, status, discovered_at) VALUES
  ('rss:intrinsic', 'rss', 'The Intrinsic Perspective', 'https://www.theintrinsicperspective.com/feed', 1, 0.85, 'Curated Substack', 'active', 0),
  ('rss:exphistory', 'rss', 'Experimental History', 'https://www.experimental-history.com/feed', 6, 0.85, 'Curated Substack', 'active', 0),
  ('rss:acx', 'rss', 'Astral Codex Ten', 'https://www.astralcodexten.com/feed', 6, 0.8, 'Curated Substack', 'active', 0),
  ('rss:lenny', 'rss', 'Lenny''s Newsletter', 'https://www.lennysnewsletter.com/feed', 7, 0.85, 'Curated Substack', 'active', 0),
  ('rss:notboring', 'rss', 'Not Boring', 'https://www.notboring.co/feed', 7, 0.8, 'Curated Substack', 'active', 0),
  ('rss:generalist', 'rss', 'The Generalist', 'https://www.generalist.com/feed', 7, 0.85, 'Curated Substack', 'active', 0),
  ('rss:pragmatic', 'rss', 'The Pragmatic Engineer', 'https://newsletter.pragmaticengineer.com/feed', 8, 0.85, 'Curated Substack', 'active', 0),
  ('rss:oneuseful', 'rss', 'One Useful Thing', 'https://www.oneusefulthing.org/feed', 8, 0.9, 'Curated Substack', 'active', 0),
  ('rss:importai', 'rss', 'Import AI', 'https://importai.substack.com/feed', 8, 0.85, 'Curated Substack', 'active', 0),
  ('rss:noahpinion', 'rss', 'Noahpinion', 'https://www.noahpinion.blog/feed', 9, 0.8, 'Curated Substack', 'active', 0),
  ('rss:constructionphysics', 'rss', 'Construction Physics', 'https://www.construction-physics.com/feed', 9, 0.9, 'Curated Substack', 'active', 0),
  ('rss:slowboring', 'rss', 'Slow Boring', 'https://www.slowboring.com/feed', 9, 0.75, 'Curated Substack', 'active', 0),
  ('rss:yle', 'rss', 'Your Local Epidemiologist', 'https://yourlocalepidemiologist.substack.com/feed', 10, 0.9, 'Curated Substack', 'active', 0),
  ('rss:groundtruths', 'rss', 'Ground Truths (Eric Topol)', 'https://erictopol.substack.com/feed', 10, 0.85, 'Curated Substack', 'active', 0),
  ('rss:atu', 'rss', 'Anticipating the Unintended', 'https://publicpolicy.substack.com/feed', 4, 0.85, 'Curated Substack', 'active', 0);
