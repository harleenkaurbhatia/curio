# Curio Round 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Text "reads" from Bluesky/HN/RSS in the feed, Save/Later/Share/Thought actions with voice, session summary, install button, deployed link.
**Architecture:** New `feeds` + `posts` tables beside YouTube's; a second job pipeline (`jobs/reads.ts`) with its own call budget; ranking gains a `kind` with a no-two-reads-in-a-row rule; library tables (`saves`, `notes`) keep an item snapshot so entries survive feed cleanup.
**Tech Stack:** as Phase 1; Web Share API; Web Speech API.
**Spec:** `docs/superpowers/specs/2026-10-18-curio-design.md` (Round 2 section)

## Global Constraints
- Reads share the freshness windows (news 3 d, other 21 d) and the seen rule.
- Never two `post` items adjacent when a video is available; reads ≤ ~40% of a batch.
- Shared links are the public source URLs only.
- Reads pipeline ≤ 20 outbound calls per run; videos ≤ 24.

## Review Focus
1. Feed with only reads left → still returns them (no starvation) and caught-up still works.
2. RSS with HTML entities/CDATA/no dates → parsed text is clean; undated items skipped.
3. Share unsupported (desktop) → WhatsApp + copy fallback shown, nothing throws.
4. Speech recognition unsupported or denied → mic hidden or message shown; typing still works.
5. Saving the same item twice → one entry; removing works.

### Task 1: Ranking `kind` rule (TDD)
`Candidate.kind?: 'video' | 'post'`. Tests: no post after post when a video exists; only-posts pool returns all; posts ≤ 40% of a 10-item batch from a 50/50 pool.

### Task 2: RSS + Bluesky + HN parsers (TDD)
`src/core/rss.ts` `parseFeed(xml: string): {id; title; text; url; publishedAt; image?}[]` (RSS 2.0 + Atom, CDATA, entities, tags stripped, ≤ 600 chars). `src/core/bsky.ts` `postsFromAuthorFeed(json)` (skip replies/reposts, text-only or with link card, https post URL). Tests per Review Focus 2.

### Task 3: Post screening parser (TDD)
`src/core/postScores.ts` `parsePostScores(raw, ids)` → `{id; score; accept; hook}`; accept = no reject_reason && score ≥ 0.65.

### Task 4: Schema 0002 + repo + reads job
`feeds`, `posts`, `saves(item_id, list, snapshot, at, PK(item_id,list))`, `notes(id, item_id, snapshot, text, at)`; seed RSS feeds + HN. `jobs/reads.ts`: discover Bluesky people for topics with < 6 (once/day) → vet with `Curator.scoreChannels` → fetch due feeds (4 h) → screen pending posts in groups of 20 with `Curator.screenPosts`.

### Task 5: API
Feed items gain `kind`, `url`, post fields. `POST/DELETE /api/library/:list` (saved|later), `GET /api/library`, `POST /api/notes`, `DELETE /api/notes/:id`. Creators list includes Bluesky people and feeds.

### Task 6: Frontend
Read card slide; action rail (👍 👎 🔖 🕒 ↗ 💭); share sheet with fallbacks; thought sheet with mic (en-IN / hi-IN); Library tab (Saved / Later / Thoughts) with in-app viewer; "Done for now" summary; Install button (`beforeinstallprompt`).

### Task 7: Verify + deploy
Unit tests, UI check extended (read card, save, later, share fallback, thought), README; deploy when owner has run `wrangler login` and set secrets.
