import { describe, it, expect } from 'vitest';
import { buildFeed, isFresh, baseScore, type Candidate, type Weights } from '../src/core/ranking';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 18);
const W: Weights = { topic: {}, channel: {} };

let n = 0;
const c = (topic: string, channelId: string, ageDays = 1, extra: Partial<Candidate> = {}): Candidate => ({
  id: `v${n++}`, topic, channelId, publishedAt: NOW - ageDays * DAY, channelScore: 0.8, news: false, ...extra,
});
const seeded = (seed = 1) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

describe('isFresh', () => {
  it('news expires after 3 days, other topics after 45', () => {
    expect(isFresh(c('news', 'a', 2.9, { news: true }), NOW)).toBe(true);
    expect(isFresh(c('news', 'a', 3.1, { news: true }), NOW)).toBe(false);
    expect(isFresh(c('science', 'a', 44), NOW)).toBe(true);
    expect(isFresh(c('science', 'a', 46), NOW)).toBe(false);
  });
});

describe('baseScore', () => {
  it('prefers newer, higher-weighted, higher-quality videos', () => {
    expect(baseScore(c('s', 'a', 1), W, NOW)).toBeGreaterThan(baseScore(c('s', 'a', 5), W, NOW));
    const liked: Weights = { topic: { s: 2 }, channel: {} };
    expect(baseScore(c('s', 'a'), liked, NOW)).toBeGreaterThan(baseScore(c('t', 'a'), liked, NOW));
    expect(baseScore(c('s', 'a', 1, { channelScore: 0.9 }), W, NOW))
      .toBeGreaterThan(baseScore(c('s', 'a', 1, { channelScore: 0.6 }), W, NOW));
  });
});

describe('buildFeed', () => {
  const opts = { now: NOW, limit: 10, seen: new Set<string>(), rng: seeded() };

  it('excludes seen and stale videos', () => {
    const seen = c('s', 'a'), stale = c('s', 'b', 50), ok = c('t', 'c');
    const out = buildFeed([seen, stale, ok], W, { ...opts, seen: new Set([seen.id]) });
    expect(out.map((x) => x.id)).toEqual([ok.id]);
  });

  it('returns [] for an empty pool', () => {
    expect(buildFeed([], W, opts)).toEqual([]);
  });

  it('never puts the same topic or creator back to back when there is an alternative', () => {
    const pool = [
      ...Array.from({ length: 6 }, (_, i) => c('tech', `t${i % 2}`, 0.5)),
      ...Array.from({ length: 4 }, (_, i) => c('science', `s${i % 2}`, 2)),
      ...Array.from({ length: 4 }, (_, i) => c('cooking', `k${i}`, 3)),
    ];
    const out = buildFeed(pool, { topic: { tech: 3 }, channel: {} }, { ...opts, limit: 14 });
    for (let i = 1; i < out.length; i++) {
      const ok = out[i].topic !== out[i - 1].topic && out[i].channelId !== out[i - 1].channelId;
      // Only allowed to repeat once alternatives run out (the tail of the feed).
      if (!ok) expect(out.slice(i).every((x) => x.topic === out[i].topic)).toBe(true);
    }
  });

  it('still returns everything when only one creator is left', () => {
    const pool = [c('s', 'only'), c('s', 'only'), c('s', 'only')];
    expect(buildFeed(pool, W, opts)).toHaveLength(3);
  });

  it('mixes topics even when one topic is strongly preferred', () => {
    const pool = [
      ...Array.from({ length: 10 }, (_, i) => c('tech', `t${i}`)),
      ...Array.from({ length: 10 }, (_, i) => c('science', `s${i}`)),
    ];
    const out = buildFeed(pool, { topic: { tech: 3 }, channel: {} }, opts);
    const tech = out.filter((x) => x.topic === 'tech').length;
    expect(tech).toBeGreaterThanOrEqual(4);
    expect(tech).toBeLessThanOrEqual(6);
  });

  it('explores: a 10-item feed includes a low-weight topic', () => {
    const pool = [
      ...Array.from({ length: 10 }, (_, i) => c('a', `a${i}`)),
      ...Array.from({ length: 10 }, (_, i) => c('b', `b${i}`)),
      ...Array.from({ length: 3 }, (_, i) => c('rare', `r${i}`)),
    ];
    const out = buildFeed(pool, { topic: { a: 3, b: 3, rare: 0.2 }, channel: {} }, { ...opts, explore: 0.2 });
    expect(out.some((x) => x.topic === 'rare')).toBe(true);
  });

  it('respects the previous batch (lastTopic/lastChannel)', () => {
    const pool = [c('tech', 'x', 0.1), c('science', 'y', 5)];
    const out = buildFeed(pool, W, { ...opts, lastTopic: 'tech' });
    expect(out[0].topic).toBe('science');
  });

  it('is deterministic for the same seed', () => {
    const pool = Array.from({ length: 30 }, (_, i) => c(`t${i % 5}`, `c${i % 7}`, i % 10));
    const a = buildFeed(pool, W, { ...opts, rng: seeded(7) }).map((x) => x.id);
    const b = buildFeed(pool, W, { ...opts, rng: seeded(7) }).map((x) => x.id);
    expect(a).toEqual(b);
  });

  it('never returns duplicates', () => {
    const v = c('s', 'a');
    expect(buildFeed([v, v, c('t', 'b')], W, opts)).toHaveLength(2);
  });
});

describe('buildFeed with reads', () => {
  const opts = { now: NOW, limit: 10, seen: new Set<string>(), rng: seeded(3) };
  const post = (topic: string, ch: string, age = 0.5) => c(topic, ch, age, { kind: 'post' });

  it('never puts two reads back to back while videos remain', () => {
    const pool = [
      ...Array.from({ length: 8 }, (_, i) => post(`t${i % 4}`, `p${i}`, 0.1)), // fresher, would win on score
      ...Array.from({ length: 6 }, (_, i) => c(`t${(i + 1) % 4}`, `v${i}`, 2)),
    ];
    const out = buildFeed(pool, W, { ...opts, limit: 12 });
    for (let i = 1; i < out.length; i++) {
      if (out[i].kind === 'post' && out[i - 1].kind === 'post') {
        expect(out.slice(i).every((x) => x.kind === 'post')).toBe(true);
      }
    }
  });

  it('keeps reads to at most 40% of a batch when videos are plentiful', () => {
    const pool = [
      ...Array.from({ length: 10 }, (_, i) => post(`t${i % 5}`, `p${i}`, 0.1)),
      ...Array.from({ length: 10 }, (_, i) => c(`t${(i + 2) % 5}`, `v${i}`, 1)),
    ];
    const out = buildFeed(pool, W, opts);
    expect(out.filter((x) => x.kind === 'post').length).toBeLessThanOrEqual(4);
  });

  it('still serves reads when nothing else is left', () => {
    const pool = [post('a', 'p1'), post('b', 'p2'), post('a', 'p3')];
    expect(buildFeed(pool, W, opts)).toHaveLength(3);
  });
});

import { likeFactor, postQuality } from '../src/core/ranking';
describe('quality weighting', () => {
  it('quality is cubed: 0.9 beats 0.6 by about 3.4x', () => {
    const hi = baseScore(c('s', 'a', 1, { channelScore: 0.9 }), W, NOW);
    const lo = baseScore(c('s', 'a', 1, { channelScore: 0.6 }), W, NOW);
    expect(hi / lo).toBeCloseTo(3.375, 2);
  });
  it('like-to-view ratio is a small boost between 0.9x and 1.1x', () => {
    expect(likeFactor(undefined)).toBe(1);
    expect(likeFactor(0.035)).toBeCloseTo(1, 1);
    expect(likeFactor(0.2)).toBeCloseTo(1.1);
    expect(likeFactor(0.001)).toBeCloseTo(0.9);
    const liked = baseScore(c('s', 'a', 1, { likeRatio: 0.2 }), W, NOW);
    const plain = baseScore(c('s', 'a', 1), W, NOW);
    expect(liked / plain).toBeCloseTo(1.1);
  });
  it('an article uses the lower of its own and its site score, lifted 0.1 onto the video scale', () => {
    expect(postQuality(0.5, 0.9)).toBeCloseTo(0.6);
    expect(postQuality(0.8, 0.6)).toBeCloseTo(0.7);
    expect(postQuality(null, 0.85)).toBeCloseTo(0.95);
    expect(postQuality(0.95, 0.98)).toBe(1);
  });
});
