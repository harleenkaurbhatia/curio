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

## Round 2 additions (2026-10-18, approved by the owner)

**Reads in the feed.** Text cards mixed into the swipe feed, vetted by Claude like videos:
- Bluesky: discover people per topic (`searchActors`), vet them from bio + recent posts, then read their posts (`getAuthorFeed`). Free, no key.
- Hacker News front page (points ≥ 150) for Tech / Founders. Free.
- Newsletters and explainers via RSS (Quanta, Nature, Nobel Prize, BBC World, Rest of World, The Hindu, Indian Express Explained, Scroll, BBC Hindi, Psyche, Aeon, Lenny's Newsletter, Inc42, TechCrunch). Free.
- Not included: LinkedIn (no official read access; scraping risks the owner's account), Reddit (blocks servers without OAuth app), X (paid per read, roughly $10–30/month; add later behind an optional key).
- Every post is screened by Claude (score + reject reasons + one-line "why read this"). Never two text cards in a row.

**Actions on every item:** 👍 / 👎, Save, Later, Share, Thought.
- Share opens the phone's share sheet (WhatsApp etc.) with the original public link (YouTube / article / post), never the private Curio URL. Fallbacks: WhatsApp link, copy link.
- Save = keep forever; Later = watch/read later queue. Both live in a Library screen.
- Thought = type or speak (Hindi or English) an idea or question; saved with the item it came from.
- "That's all for now" button ends a session with a calm summary (watched, saved, thoughts), not an abrupt stop.

**Download link.** The deployed HTTPS URL is the download link: Chrome offers "Install app", and Curio shows its own Install button.

**Builder's calls:** Library viewer plays saved videos in-app (privacy-enhanced embed) and shows full text for posts; separate per-run request budgets for videos (24) and reads (20) to stay inside Cloudflare's 50-request limit; voice uses the browser's speech recognition (Chrome on Android supports en-IN and hi-IN), hidden where unsupported.

## Round 2b: multi-user (owner decision, 2026-10-18)

This replaces the single-user/passcode decision.
- **Anyone can sign up** (email + password). Each user has their own topics, languages, feed, seen history, 👍/👎 weights, saves, later list, thoughts and blocked creators.
- **Shared catalog:** topics, creators/feeds, videos, posts and all Claude vetting are shared, so cost doesn't grow per user. A topic is refreshed only if someone follows it. Custom topics are added to the shared catalog (max 5 per user, to protect the YouTube quota).
- **Removing a creator** hides them for that user only.
- **Personal insights only:** each user sees their own time spent (today / week), items, streak, topic mix, likes, saves and thoughts. No owner dashboard, no third-party analytics.
- **Share:** phone share sheet with the original public link (unchanged).
- **Privacy:** passwords hashed (PBKDF2-SHA256); revocable server-side sessions; users' data visible only to themselves.

Builder's calls: email/password now, Google sign-in and reset emails later (need OAuth client / a sending domain); `ADMIN_TOKEN` header protects the manual refresh endpoint; language preference filters creators by detected language (unknown passes).
