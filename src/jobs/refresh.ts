import { curatedScore } from '../core/channelScores';
import { CallLimit, CallLimitReached, QuotaBudget, QuotaExceeded } from '../core/quota';
import { classifyVideo, parseDuration, fullVideoId, likeRatio } from '../core/shorts';
import { YouTube } from '../youtube';
import { Curator, type ChannelForReview } from '../llm';
import { Repo, type NewVideo } from '../db';

export type Env = {
  DB: D1Database;
  ASSETS: Fetcher;
  YOUTUBE_API_KEY: string;
  ANTHROPIC_API_KEY: string;
  ADMIN_TOKEN?: string;
  IG_APP_SECRET?: string;   // Meta app secret, verifies webhook signatures
  IG_VERIFY_TOKEN?: string; // shared with Meta when subscribing the webhook
};

const DAY = 86_400_000;
const TARGET_CHANNELS_PER_TOPIC = 12;
const NEW_CANDIDATES_PER_TOPIC = 8;
const SCORE_GROUP = 15;
const MAX_SCORED_PER_RUN = 30;
// Free plan allows 50 outbound requests per run; keep headroom.
const CALLS_PER_RUN = 24; // reads pipeline gets its own 20
const REDISCOVER_AFTER = DAY;
const REFETCH_AFTER = 4 * 60 * 60 * 1000;

export type RefreshReport = { discovered: number; scored: number; accepted: number; newVideos: number; quotaUsed: number; stoppedEarly?: string; errors?: string[] };

export async function refreshVideos(env: Env, now = Date.now()): Promise<RefreshReport> {
  const repo = new Repo(env.DB);
  const q = await repo.quotaUsed();
  const budget = new QuotaBudget(q.used, q.searches);
  const calls = new CallLimit(CALLS_PER_RUN);
  const yt = new YouTube(env.YOUTUBE_API_KEY, budget, calls);
  const report: RefreshReport = { discovered: 0, scored: 0, accepted: 0, newVideos: 0, quotaUsed: 0 };
  if (!env.YOUTUBE_API_KEY || !env.ANTHROPIC_API_KEY) return { ...report, stoppedEarly: 'YOUTUBE_API_KEY / ANTHROPIC_API_KEY not set' };

  try {
    await discover(repo, yt, now, report);
    try {
      const curator = new Curator(env.ANTHROPIC_API_KEY, calls);
      Object.assign(report, await scorePending(repo, curator, now));
      await scoreCurated(repo, yt, curator, now);
    } catch (e) {
      if (e instanceof QuotaExceeded || e instanceof CallLimitReached) throw e;
      // Claude unavailable: keep fetching from already-approved creators.
      (report.errors ??= []).push(String(e).slice(0, 200));
    }
    report.newVideos = await fetchNewShorts(repo, yt, now);
  } catch (e) {
    if (!(e instanceof QuotaExceeded || e instanceof CallLimitReached)) throw e;
    report.stoppedEarly = e.message; // keep everything fetched so far
  } finally {
    await repo.saveQuota(budget.used, budget.searches);
    report.quotaUsed = budget.used;
  }
  return report;
}

// Search (100 units) only for topics that are short of creators.
async function discover(repo: Repo, yt: YouTube, now: number, report: RefreshReport): Promise<void> {
  const [topics, counts, known] = await Promise.all([repo.followedTopics(), repo.activeCountByTopic(), repo.knownChannelIds()]);
  for (const t of topics) {
    if ((counts.get(t.id) ?? 0) >= TARGET_CHANNELS_PER_TOPIC) continue;
    if (t.last_discovered_at && now - t.last_discovered_at < REDISCOVER_AFTER) continue;
    const days = t.mode === 'catchup' ? 7 : 30;
    const hits = [
      ...(await yt.searchShorts(t.query_en, 'en', days)),
      ...(await yt.searchShorts(t.query_hi, 'hi', days)),
      // Full videos (4–20 min) for topics like recipes, from the same kind of creators.
      ...(t.long_videos ? await yt.searchShorts(t.query_en, 'en', 90, 'medium') : []),
    ];
    // Channels that show up more than once in search are better bets.
    const freq = new Map<string, number>();
    for (const h of hits) if (!known.has(h.channelId)) freq.set(h.channelId, (freq.get(h.channelId) ?? 0) + 1);
    const ids = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, NEW_CANDIDATES_PER_TOPIC).map(([id]) => id);
    await repo.markDiscovered(t.id, now); // searched today, even if a later step runs out of budget
    if (!ids.length) continue;

    const infos = await yt.channels(ids);
    for (const c of infos) {
      const recent = await yt.latestUploads(c.uploads, 10).catch((e) => {
        if (e instanceof QuotaExceeded || e instanceof CallLimitReached) throw e;
        return [];
      });
      await repo.insertChannels([{
        id: c.id, title: c.title, topic_id: t.id, thumb: c.thumb, uploads_playlist: c.uploads, discovered_at: now,
        sample_titles: JSON.stringify({ subscribers: c.subscribers, recent: recent.map((r) => ({ title: r.title, publishedAt: r.publishedAt })) }),
      }]);
      known.add(c.id);
      report.discovered++; // counted as we go, so a run cut short still reports it
    }
  }
}

// Hand-picked creators are scored by Claude too, from the videos we already have (no extra YouTube cost
// beyond one call for subscriber counts). They stay active; the score only moves them up or down.
async function scoreCurated(repo: Repo, yt: YouTube, curator: Curator, now: number) {
  const waiting = (await repo.channels('active')).filter((c) => c.reason === 'Curated (to score)');
  const titles = await repo.recentTitles(waiting.map((c) => c.id), 10);
  // New creators wait until their first videos are fetched, so Claude has something to judge.
  const todo = waiting.filter((c) => titles.get(c.id)?.length).slice(0, SCORE_GROUP);
  if (!todo.length) return;
  const [topics, infos] = await Promise.all([repo.topics(), yt.channels(todo.map((c) => c.id))]);
  const topicName = new Map(topics.map((t) => [t.id, t.name]));
  const subs = new Map(infos.map((i) => [i.id, i.subscribers]));
  const scores = await curator.scoreChannels(todo.map((c) => ({
    id: c.id, title: c.title, topic: topicName.get(c.topic_id) ?? '', subscribers: subs.get(c.id) ?? 0,
    recentTitles: (titles.get(c.id) ?? []).map((v) => ({ title: v.title, daysAgo: Math.round((now - v.published_at) / DAY) })),
  })));
  await repo.saveCuratedScores(scores.map((s) => ({ id: s.id, score: curatedScore(s), language: s.language, reason: `Curated, scored: ${s.reason}` })));
}

async function scorePending(repo: Repo, curator: Curator, now: number) {
  const [pending, topics] = await Promise.all([repo.channels('pending'), repo.topics()]);
  const topicName = new Map(topics.map((t) => [t.id, t.name]));
  const batch: ChannelForReview[] = pending.slice(0, MAX_SCORED_PER_RUN).map((c) => {
    const s = JSON.parse(c.sample_titles || '{}');
    return {
      id: c.id, title: c.title, topic: topicName.get(c.topic_id) ?? '', subscribers: s.subscribers ?? 0,
      recentTitles: (s.recent ?? []).map((r: any) => ({ title: r.title, daysAgo: Math.round((now - r.publishedAt) / DAY) })),
    };
  });
  let scored = 0, accepted = 0;
  for (let i = 0; i < batch.length; i += SCORE_GROUP) {
    const group = batch.slice(i, i + SCORE_GROUP);
    const scores = await curator.scoreChannels(group);
    // Consistency floor: nothing posted in the last 30 days means not active enough.
    for (const s of scores) {
      const ch = group.find((g) => g.id === s.id)!;
      if (!ch.recentTitles.some((t) => t.daysAgo <= 30)) { s.accept = false; s.reason = `inactive: ${s.reason}`; }
    }
    await repo.saveScores(scores);
    scored += scores.length;
    accepted += scores.filter((s) => s.accept).length;
  }
  return { scored, accepted };
}

// 1 unit per creator + 1 unit per 50 new videos. Least recently checked creators go first.
async function fetchNewShorts(repo: Repo, yt: YouTube, now: number): Promise<number> {
  const longOk = new Set((await repo.topics()).filter((t) => t.long_videos).map((t) => t.id));
  const active = (await repo.channels('active'))
    .filter((c) => !c.last_fetched_at || now - c.last_fetched_at >= REFETCH_AFTER)
    .sort((a, b) => (a.last_fetched_at ?? 0) - (b.last_fetched_at ?? 0));
  let added = 0;
  for (const c of active) {
    let uploads;
    try {
      uploads = await yt.latestUploads(c.uploads_playlist, 8);
    } catch (e) {
      if (e instanceof QuotaExceeded || e instanceof CallLimitReached) throw e;
      continue; // deleted/private playlist: skip this creator
    }
    const recent = uploads.filter((u) => now - u.publishedAt <= 45 * DAY);
    const known = await repo.knownVideoIds(recent.map((u) => u.id));
    const fresh = recent.filter((u) => !known.has(u.id));
    if (fresh.length) {
      const details = new Map((await yt.videoDetails(fresh.map((u) => u.id))).map((d) => [d.id, d]));
      const keep: NewVideo[] = fresh.flatMap((u) => {
        const d = details.get(u.id);
        const type = d && classifyVideo(d, longOk.has(c.topic_id));
        return type
          ? [{ id: u.id, channel_id: c.id, topic_id: c.topic_id, title: u.title, published_at: u.publishedAt, duration_s: parseDuration(d.duration), vertical: type === 'short',
              full_id: type === 'short' ? fullVideoId(u.description, u.id) : null, like_ratio: likeRatio(d.views, d.likes) }]
          : [];
      });
      await repo.insertVideos(keep);
      added += keep.length;
    }
    await repo.markFetched(c.id, now);
  }
  return added;
}
