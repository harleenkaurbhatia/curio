-- Full-length videos (2–20 min) for topics where Shorts alone fall short, e.g. recipes.
ALTER TABLE topics ADD COLUMN long_videos INTEGER NOT NULL DEFAULT 0;
UPDATE topics SET long_videos = 1 WHERE name IN ('Cooking recipes', 'Science & innovation', 'Knowledge & facts', 'Health basics', 'Psychology', 'Tech');
UPDATE topics SET query_en = 'easy recipe', query_hi = 'आसान रेसिपी हिंदी' WHERE name = 'Cooking recipes';
-- Rediscover today so long-video creators get found.
UPDATE topics SET last_discovered_at = NULL;

ALTER TABLE videos ADD COLUMN vertical INTEGER NOT NULL DEFAULT 1;

-- Knowledge, ideas and recipes, not just news.
INSERT OR IGNORE INTO feeds (id, kind, title, url, topic_id, score, reason, status, discovered_at) VALUES
  ('rss:nautilus', 'rss', 'Nautilus', 'https://nautil.us/feed/', 1, 0.9, 'Curated', 'active', 0),
  ('rss:knowable', 'rss', 'Knowable Magazine', 'https://knowablemagazine.org/rss', 1, 0.9, 'Curated', 'active', 0),
  ('rss:sciencenews', 'rss', 'Science News', 'https://www.sciencenews.org/feed', 1, 0.85, 'Curated', 'active', 0),
  ('rss:sciencealert', 'rss', 'ScienceAlert', 'https://www.sciencealert.com/feed', 1, 0.75, 'Curated', 'active', 0),
  ('rss:newscientist', 'rss', 'New Scientist', 'https://www.newscientist.com/feed/home/', 1, 0.85, 'Curated', 'active', 0),
  ('rss:psypost', 'rss', 'PsyPost', 'https://www.psypost.org/feed/', 6, 0.8, 'Curated', 'active', 0),
  ('rss:neurosci', 'rss', 'Neuroscience News', 'https://neurosciencenews.com/feed/', 6, 0.8, 'Curated', 'active', 0),
  ('rss:stratechery', 'rss', 'Stratechery', 'https://stratechery.com/feed/', 7, 0.85, 'Curated', 'active', 0),
  ('rss:ars', 'rss', 'Ars Technica', 'https://feeds.arstechnica.com/arstechnica/index', 8, 0.85, 'Curated', 'active', 0),
  ('rss:mittr', 'rss', 'MIT Technology Review', 'https://www.technologyreview.com/feed/', 8, 0.85, 'Curated', 'active', 0),
  ('rss:wiki-featured', 'rss', 'Wikipedia: Featured article', 'https://en.wikipedia.org/w/api.php?action=featuredfeed&feed=featured&feedformat=atom', 9, 0.9, 'Curated', 'active', 0),
  ('rss:wiki-onthisday', 'rss', 'Wikipedia: On this day', 'https://en.wikipedia.org/w/api.php?action=featuredfeed&feed=onthisday&feedformat=atom', 9, 0.85, 'Curated', 'active', 0),
  ('rss:smithsonian', 'rss', 'Smithsonian', 'https://www.smithsonianmag.com/rss/latest_articles/', 9, 0.85, 'Curated', 'active', 0),
  ('rss:atlasobscura', 'rss', 'Atlas Obscura', 'https://www.atlasobscura.com/feeds/latest', 9, 0.85, 'Curated', 'active', 0),
  ('rss:fsblog', 'rss', 'Farnam Street', 'https://fs.blog/feed/', 9, 0.85, 'Curated', 'active', 0),
  ('rss:marginalian', 'rss', 'The Marginalian', 'https://www.themarginalian.org/feed/', 9, 0.85, 'Curated', 'active', 0),
  ('rss:mentalfloss', 'rss', 'Mental Floss', 'https://www.mentalfloss.com/rss.xml', 9, 0.75, 'Curated', 'active', 0),
  ('rss:owid', 'rss', 'Our World in Data', 'https://ourworldindata.org/atom.xml', 9, 0.9, 'Curated', 'active', 0),
  ('rss:bigthink', 'rss', 'Big Think', 'https://bigthink.com/feed/', 9, 0.8, 'Curated', 'active', 0),
  ('rss:betterindia', 'rss', 'The Better India', 'https://www.thebetterindia.com/feed/', 9, 0.75, 'Curated', 'active', 0),
  ('rss:betterindia-hi', 'rss', 'The Better India हिंदी', 'https://hindi.thebetterindia.com/feed/', 9, 0.75, 'Curated', 'active', 0),
  ('rss:stat', 'rss', 'STAT', 'https://www.statnews.com/feed/', 10, 0.85, 'Curated', 'active', 0),
  ('rss:conv-health', 'rss', 'The Conversation: Health', 'https://theconversation.com/global/health/articles.atom', 10, 0.85, 'Curated', 'active', 0),
  ('rss:bonappetit', 'rss', 'Bon Appétit', 'https://www.bonappetit.com/feed/rss', 11, 0.8, 'Curated', 'active', 0),
  ('rss:budgetbytes', 'rss', 'Budget Bytes', 'https://www.budgetbytes.com/feed/', 11, 0.8, 'Curated', 'active', 0),
  ('rss:thekitchn', 'rss', 'The Kitchn', 'https://www.thekitchn.com/main.rss', 11, 0.8, 'Curated', 'active', 0),
  ('rss:bbcgoodfood', 'rss', 'BBC Good Food', 'https://www.bbcgoodfood.com/feed', 11, 0.8, 'Curated', 'active', 0),
  ('rss:vegrecipesindia', 'rss', 'Dassana''s Veg Recipes', 'https://www.vegrecipesofindia.com/feed/', 11, 0.85, 'Curated', 'active', 0),
  ('rss:smittenkitchen', 'rss', 'Smitten Kitchen', 'https://smittenkitchen.com/feed/', 11, 0.8, 'Curated', 'active', 0);
