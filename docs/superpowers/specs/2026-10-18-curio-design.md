# Curio — design

A private short-video app for one person: Reels-style fun, pointed at knowledge, with zero social layer.

## Why
Instagram is fun but its stories and lifestyle content cause comparison. The owner likes knowledgeable reels (news explained, science, smart creators) and wants only that, in short 5–10 minute breaks throughout the day.

## Goals
- Feels as fun as Reels: full-screen vertical swipe, fast, varied, surprising.
- Always fresh: never repeats a seen video; news-type content must be recent.
- Varied: never two videos in a row from the same topic or creator; ~1 in 5 videos explores less-seen topics/creators.
- Discovers creators automatically from topics; owner can view and remove creators.
- Learns from 👍/👎 (and later: "more like this", "not this creator", skips, rewatches), weighting explicit ratings over watch time.
- Hindi, Hinglish and English content.
- Cheap (≈$0–1/month) but not at the cost of quality.

## Non-goals
- Other users, accounts, sharing, friends, comments, like counts, stories.
- Downloading or re-hosting videos.
- "Read more" context/links (parked for later).

## Anti-goals (failure even if it works)
- Content that invites comparison: lifestyle/flex vlogs, "day in my life", luxury, even when tagged founder/startup.
- Drift toward outrage, rage-bait, clickbait, dubious health claims.
- Padding the feed with repeats or junk when fresh good content runs out.

## Decided by the owner
- Endless scroll, **no hard stop**. When fresh approved supply runs out, show "That's everything new for now" instead of padding. (Replaces the original fixed 25/day.)
- Starting topics: recent science & innovation, Nobel Prizes, world news, India news, protests & civic movements, psychology, new founders & startups, tech, non-tech knowledge, basic health advice, cooking recipes. Editable in-app.
- Modes: Catch up (news), Learn (science, psychology, founders), Unwind (recipes, light).
- Playback only through the official YouTube IFrame Player API.
- YouTube Data API v3 for discovery; search sparingly (100 units), then uploads playlists (1 unit). Shorts = ≤ 3 minutes and vertical.
- Claude API, cheap fast model, batched and cached, for channel scoring, video screening, captions.
- Small backend with scheduled job; SQLite. Single user, passcode-protected. No analytics or third-party trackers. Keys in env vars.
- Phases: 1 MVP (topics, discovery, feed, swipe player, 👍/👎, caught-up screen); 2 (LLM quality filter + captions, learning, modes & topic mix); 3 (saved shelf, weekly recap, share target).
- TDD for ranking, filtering and quota logic. Browser-test UI at phone width. Commit per working step. README with setup, keys, deploy.

## Builder's calls (Claude's, open to change)
- **Hosting:** Cloudflare Workers (free) — Worker serves the PWA and API, D1 is the SQLite database, Cron Triggers run the job. HTTPS out of the box (required for Android PWA install).
- **Refresh cadence:** every 4 hours rather than once a day, so news stays fresh across many daily breaks. Channel discovery only runs for topics that are short of creators, keeping search spend low.
- **Model:** Claude Haiku 5.5 for all LLM work, with structured JSON output; requests grouped (many channels/videos per call). Channel scoring is in Phase 1 (not heuristics only) because "cheap should not mean not effective".
- **Freshness windows:** news topics 3 days; everything else 21 days.
- **Vertical detection:** `videos.list` `player` part with `maxHeight` returns embed width/height; vertical = height > width.
- **Ranking:** score = topic weight × channel quality × freshness decay, adjusted by feedback; then a diversity pass (no same topic/creator back to back) with ~20% exploration slots.
- **Frontend:** plain HTML/CSS/JS (no framework), CSS scroll-snap swipe, one YouTube player reused across slides. Starts muted (mobile autoplay rule); one tap unmutes for the session.
- **Auth:** passcode → HMAC-signed HttpOnly cookie.
