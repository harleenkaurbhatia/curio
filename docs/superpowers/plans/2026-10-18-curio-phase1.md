# Curio Phase 1 (MVP) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Installable PWA with editable topics, automatic creator discovery, an endless fresh & varied Shorts feed, swipe player, 👍/👎, and a caught-up screen.

**Architecture:** One Cloudflare Worker serves static PWA assets and a JSON API (Hono), stores everything in D1, and runs a cron refresh job (discover channels → score with Claude → pull uploads → keep Shorts). Pure logic (quota, shorts detection, ranking, feedback weights) lives in `src/core/` with no I/O so it is unit-tested with Vitest.

**Tech Stack:** TypeScript, Cloudflare Workers + D1 + Cron, Hono, @anthropic-ai/sdk (claude-haiku-5-5), Vitest, Playwright (UI check).

**Spec:** `docs/superpowers/specs/2026-10-18-curio-design.md`

## Global Constraints
- Shorts = duration ≤ 180 s AND embed height > width.
- Quota: 10,000 units/day; search = 100, channels/playlistItems/videos list = 1 per call. Keep a 1,000-unit reserve.
- Freshness: news topics (world news, India news, protests & civic movements) ≤ 3 days; others ≤ 21 days.
- Never return a video already seen. Never two consecutive items with same topic or same channel when an alternative exists.
- Exploration ≈ 20% of slots.
- Languages: en, hi (Hindi + Hinglish).
- No secrets in repo: `YOUTUBE_API_KEY`, `ANTHROPIC_API_KEY`, `APP_PASSCODE`, `SESSION_SECRET` via env / `.dev.vars` (gitignored).
- No analytics, no third-party scripts except the YouTube IFrame API.

## Review Focus
1. Pool has only one topic/channel left → diversity rule must not drop videos or loop; fall back to best available.
2. Pool empty → feed returns `{items: [], caughtUp: true}`, UI shows caught-up screen, not a spinner.
3. Quota exhausted mid-refresh → job stops cleanly, keeps what it fetched, no exception.
4. Claude returns malformed/missing scores for some channels → those channels stay unscored and are retried next run; others are saved.
5. Removed creator → never rediscovered and their videos vanish from the feed.

---

### Task 1: Scaffold + quota budget
**Files:** `package.json`, `tsconfig.json`, `wrangler.toml`, `.gitignore`, `vitest.config.ts`, `src/core/quota.ts`, `test/quota.test.ts`
**Produces:** `COSTS: Record<'search'|'channels'|'playlistItems'|'videos', number>`; `class QuotaBudget { constructor(used: number, limit = 10000, reserve = 1000); canSpend(op, calls = 1): boolean; spend(op, calls = 1): void /* throws QuotaExceeded */; get used(): number; get remaining(): number }`
- [ ] Tests: search costs 100; spend beyond `limit - reserve` throws `QuotaExceeded`; `canSpend` false at the boundary; starting `used` honoured.
- [ ] Implement, pass, commit.

### Task 2: Shorts detection
**Files:** `src/core/shorts.ts`, `test/shorts.test.ts`
**Produces:** `parseDuration(iso: string): number` (seconds); `isShort(v: {duration: string; embedWidth?: number; embedHeight?: number}): boolean`
- [ ] Tests: `PT59S`→59, `PT2M30S`→150, `PT1H`→3600, `P0D`→0; 180 s vertical → true; 181 s → false; horizontal → false; missing dimensions → false.
- [ ] Implement, pass, commit.

### Task 3: Ranking + diversity
**Files:** `src/core/ranking.ts`, `test/ranking.test.ts`
**Produces:** `type Candidate = {id; channelId; topic; publishedAt: number; channelScore: number /*0-1*/}`; `type Weights = {topic: Record<string, number>; channel: Record<string, number>}`; `isFresh(c, now): boolean`; `baseScore(c, w, now): number`; `buildFeed(cands: Candidate[], w: Weights, opts: {now; limit; seen: Set<string>; explore?: number; rng?: () => number; lastTopic?; lastChannel?}): Candidate[]`
- [ ] Tests: seen ids excluded; stale excluded per topic window; no adjacent same topic/channel when alternatives exist; Review Focus 1 (single-channel pool returns all items); empty pool → []; with `explore=0.2`, a 10-item feed includes ≥1 item from a low-weight topic; `lastTopic/lastChannel` respected across batches; deterministic with seeded rng.
- [ ] Implement: score = topicWeight × (0.5 + channelScore) × freshness (half-life 2 days news / 7 days other) × channelWeight; greedy pick best eligible, every 5th slot pick from the lower half by topic weight; fallback to best available if none eligible.
- [ ] Pass, commit.

### Task 4: Feedback → weights
**Files:** `src/core/feedback.ts`, `test/feedback.test.ts`
**Produces:** `applyFeedback(w: Weights, f: {topic; channelId; rating: 1 | -1}): Weights` (pure); clamp topic weights to [0.2, 3], channel to [0.1, 3]; 👍 ×1.15 / 👎 ×0.8 topic, 👍 ×1.2 / 👎 ×0.6 channel.
- [ ] Tests: up then down never leaves bounds; unknown keys start at 1; input not mutated.
- [ ] Implement, pass, commit.

### Task 5: DB schema + repository
**Files:** `migrations/0001_init.sql`, `src/db.ts`
Tables: `topics(id, name, mode, languages, active)`, `channels(id, title, topic, language, score, reason, status 'active'|'removed'|'rejected', uploads_playlist, scored_at, last_fetched_at)`, `videos(id, channel_id, topic, title, published_at, duration_s)`, `seen(video_id, at)`, `feedback(video_id, channel_id, topic, rating, at)`, `weights(kind, key, value)`, `quota(day, used)`.
**Produces:** typed helpers used by Tasks 6–8 (`getTopics`, `upsertChannels`, `activeChannels`, `insertVideos`, `candidatePool`, `markSeen`, `recordFeedback`, `loadWeights`, `saveWeights`, `quotaUsed/quotaSave`). Seeded starting topics in the migration.

### Task 6: YouTube + Claude clients and refresh job
**Files:** `src/youtube.ts`, `src/llm.ts`, `src/jobs/refresh.ts`
- discover: for active topics with < 12 active channels, one `search` per language (type=video, videoDuration=short, publishedAfter=30d, relevanceLanguage) → candidate channel ids not already known → `channels.list` (stats + uploads playlist) → 10 latest titles each → Claude scores in groups of 15 (score 0–1, language, reject reason: clickbait/rage/lifestyle-flex/repost/low-credibility) → keep score ≥ 0.6.
- fetch: per active channel, `playlistItems` (1 unit) → new ids → `videos.list` (contentDetails, player maxHeight=640) in chunks of 50 → keep `isShort`.
- Quota budget wraps every call; `QuotaExceeded` ends the job gracefully (Review Focus 3); malformed LLM rows skipped (Review Focus 4).

### Task 7: API + passcode auth
**Files:** `src/index.ts`, `src/auth.ts`
Routes: `POST /api/login`, `GET/POST/DELETE /api/topics`, `GET /api/channels`, `DELETE /api/channels/:id` (status=removed, Review Focus 5), `GET /api/feed?limit=8&lastTopic&lastChannel` → `{items, caughtUp}`, `POST /api/seen`, `POST /api/feedback`, `POST /api/admin/refresh`. `scheduled()` runs refresh. All `/api/*` except login require the cookie.

### Task 8: PWA frontend
**Files:** `public/index.html`, `public/app.js`, `public/styles.css`, `public/manifest.webmanifest`, `public/sw.js`, `public/icon.svg`
Passcode screen → feed (scroll-snap, one YT player moved into the active slide, muted until first tap) with 👍/👎 → caught-up screen → Topics & Creators screens (add/remove).

### Task 9: Verify + README
- [ ] `npm test` green; `wrangler dev` with seeded demo data; Playwright at 390×844: login, swipe, rate, caught-up, topics edit — screenshots reviewed.
- [ ] README: setup, keys (how to get each), local dev, deploy (`wrangler d1 create`, secrets, `wrangler deploy`), Android install.
