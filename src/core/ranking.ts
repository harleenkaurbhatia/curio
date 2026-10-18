export type Candidate = {
  id: string;
  channelId: string;
  topic: string;
  news: boolean; // news topics go stale faster
  publishedAt: number; // ms epoch
  channelScore: number; // 0–1 quality from Claude
};
export type Weights = { topic: Record<string, number>; channel: Record<string, number> };

const DAY = 86_400_000;
const MAX_AGE = { news: 3 * DAY, other: 21 * DAY };
const HALF_LIFE = { news: 2 * DAY, other: 7 * DAY };
// Each extra video from a topic within one batch counts for less, so batches stay mixed.
const REPEAT_PENALTY = 0.7;

export function isFresh(c: Candidate, now: number): boolean {
  return now - c.publishedAt <= (c.news ? MAX_AGE.news : MAX_AGE.other);
}

export function baseScore(c: Candidate, w: Weights, now: number): number {
  const age = Math.max(0, now - c.publishedAt);
  const freshness = 0.5 ** (age / (c.news ? HALF_LIFE.news : HALF_LIFE.other));
  return (w.topic[c.topic] ?? 1) * (w.channel[c.channelId] ?? 1) * (0.5 + c.channelScore) * freshness;
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
  let prevTopic = opts.lastTopic, prevChannel = opts.lastChannel;

  while (out.length < limit && pool.length) {
    // Strictest rule first, relaxing only when nothing qualifies.
    const tiers = [
      pool.filter((c) => c.topic !== prevTopic && c.channelId !== prevChannel),
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
    pool = pool.filter((c) => c.id !== pick!.id);
  }
  return out;
}
