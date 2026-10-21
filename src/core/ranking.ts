export type Candidate = {
  id: string;
  channelId: string;
  topic: string;
  news: boolean; // news topics go stale faster
  publishedAt: number; // ms epoch
  channelScore: number; // 0–1 quality from Claude
  kind?: 'video' | 'post'; // posts are text reads (Bluesky, HN, newsletters)
  likeRatio?: number; // YouTube likes / views when we fetched it
};
export type Weights = { topic: Record<string, number>; channel: Record<string, number> };

const DAY = 86_400_000;
const MAX_AGE = { news: 3 * DAY, other: 45 * DAY };
const HALF_LIFE = { news: 2 * DAY, other: 7 * DAY };
// Each extra video from a topic within one batch counts for less, so batches stay mixed.
const REPEAT_PENALTY = 0.7;
// Reads are a seasoning, not the meal.
const MAX_POST_SHARE = 0.4;

export function isFresh(c: Candidate, now: number): boolean {
  return now - c.publishedAt <= (c.news ? MAX_AGE.news : MAX_AGE.other);
}

export function baseScore(c: Candidate, w: Weights, now: number): number {
  const age = Math.max(0, now - c.publishedAt);
  const freshness = 0.5 ** (age / (c.news ? HALF_LIFE.news : HALF_LIFE.other));
  // Quality is cubed so it outweighs everything else: 0.9 beats 0.6 by ~3.4x.
  return (w.topic[c.topic] ?? 1) * (w.channel[c.channelId] ?? 1) * c.channelScore ** 3 * likeFactor(c.likeRatio) * freshness;
}

// A typical video gets ~3.5% likes per view. 4x better or worse moves the score by at most ±10%.
const TYPICAL_LIKES = 0.035;
export function likeFactor(ratio: number | undefined): number {
  if (!ratio || ratio <= 0) return ratio === 0 ? 0.9 : 1;
  return 1 + 0.1 * Math.max(-1, Math.min(1, Math.log(ratio / TYPICAL_LIKES) / Math.log(4)));
}

// A weak article can't ride on its site's reputation.
// Claude scores articles ~0.1 lower than channels for the same quality (live averages 0.57 vs 0.68, 2026-10-21),
// so articles are lifted 0.1 to compete fairly once quality is cubed.
const POST_CALIBRATION = 0.1;
export function postQuality(post: number | null | undefined, source: number | null | undefined): number {
  return Math.min(1, Math.min(post ?? source ?? 0.6, source ?? post ?? 0.6) + POST_CALIBRATION);
}

export type FeedOptions = {
  now: number;
  limit: number;
  seen: Set<string>;
  explore?: number; // share of slots given to less-preferred topics
  rng?: () => number;
  lastTopic?: string;
  lastChannel?: string;
};

export function buildFeed<T extends Candidate>(cands: T[], w: Weights, opts: FeedOptions): T[] {
  const { now, limit, seen, explore = 0.2, rng = Math.random } = opts;
  const byId = new Map<string, T>();
  for (const c of cands) if (!seen.has(c.id) && isFresh(c, now)) byId.set(c.id, c);
  let pool = [...byId.values()];
  if (!pool.length) return [];

  const score = new Map(pool.map((c) => [c.id, baseScore(c, w, now)]));
  const tw = (t: string) => w.topic[t] ?? 1;
  const weights = [...new Set(pool.map((c) => c.topic))].map(tw).sort((a, b) => a - b);
  const median = weights[Math.floor(weights.length / 2)];
  const exploreEvery = explore > 0 ? Math.round(1 / explore) : Infinity;

  const used = new Map<string, number>();
  const out: T[] = [];
  let prevTopic = opts.lastTopic, prevChannel = opts.lastChannel, prevKind: Candidate['kind'];
  let posts = 0;
  const maxPosts = Math.floor(limit * MAX_POST_SHARE);

  while (out.length < limit && pool.length) {
    // Strictest rule first, relaxing only when nothing qualifies.
    const kindOk = (c: T) => c.kind !== 'post' || (prevKind !== 'post' && posts < maxPosts);
    const tiers = [
      pool.filter((c) => kindOk(c) && c.topic !== prevTopic && c.channelId !== prevChannel),
      pool.filter((c) => kindOk(c) && c.channelId !== prevChannel),
      pool.filter(kindOk),
      pool.filter((c) => c.channelId !== prevChannel),
      pool,
    ];
    const eligible = tiers.find((t) => t.length)!;
    const adjusted = (c: T) => score.get(c.id)! * REPEAT_PENALTY ** (used.get(c.topic) ?? 0);

    let pick: T | undefined;
    if ((out.length + 1) % exploreEvery === 0) {
      const explorers = eligible.filter((c) => tw(c.topic) < median);
      if (explorers.length) pick = explorers[Math.floor(rng() * explorers.length)];
    }
    pick ??= eligible.reduce((best, c) => (adjusted(c) > adjusted(best) ? c : best));

    out.push(pick);
    used.set(pick.topic, (used.get(pick.topic) ?? 0) + 1);
    prevTopic = pick.topic;
    prevChannel = pick.channelId;
    prevKind = pick.kind;
    if (pick.kind === 'post') posts++;
    pool = pool.filter((c) => c.id !== pick!.id);
  }
  return out;
}
