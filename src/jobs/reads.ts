import { CallLimit, CallLimitReached } from '../core/quota';
import { parseFeed, postsFromAuthorFeed, postsFromHN, cleanText, type RawPost } from '../core/sources';
import { Curator } from '../llm';
import { Repo, type Feed } from '../db';
import type { Env } from './refresh';

const DAY = 86_400_000, HOUR = 3_600_000;
const BSKY = 'https://public.api.bsky.app/xrpc';
const CALLS_PER_RUN = 20;
const TARGET_BSKY_PER_TOPIC = 6;
const REFETCH = { rss: 2 * HOUR, hn: 2 * HOUR, bsky: 4 * HOUR };
const NEW_POSTS_PER_FEED = 8;
const FEEDS_PER_RUN = 12; // leave room for discovery
const DISCOVER_TOPICS_PER_RUN = 1;

export type ReadsReport = { screened: number; accepted: number; vetted: number; discovered: number; newPosts: number; stoppedEarly?: string; errors?: string[] };

export async function refreshReads(env: Env, now = Date.now()): Promise<ReadsReport> {
  const repo = new Repo(env.DB);
  const calls = new CallLimit(CALLS_PER_RUN);
  const curator = new Curator(env.ANTHROPIC_API_KEY, calls);
  const get = async (url: string) => {
    calls.take();
    const res = await fetch(url, { headers: { 'User-Agent': 'Curio/1.0 (+knowledge reader)', Accept: '*/*' } });
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    return res;
  };
  const report: ReadsReport = { screened: 0, accepted: 0, vetted: 0, discovered: 0, newPosts: 0 };

  // Most valuable first: screening is what makes fetched posts visible.
  const hasClaude = !!env.ANTHROPIC_API_KEY; // without it we can still collect, just not vet
  const steps = [
    ...(hasClaude ? [() => screenPosts(repo, curator, report), () => vetPeople(repo, curator, report, now)] : []),
    () => fetchFeeds(repo, get, report, now),
    () => discoverPeople(repo, get, report, now),
  ];
  for (const step of steps) {
    try {
      await step();
    } catch (e) {
      if (e instanceof CallLimitReached) { report.stoppedEarly = e.message; break; }
      // One failing step (e.g. Claude out of credit, a source down) must not stop the others.
      (report.errors ??= []).push(String(e).slice(0, 200));
      console.log('reads step failed', String(e));
    }
  }
  return report;
}

async function screenPosts(repo: Repo, curator: Curator, report: ReadsReport) {
  const pending = await repo.pendingPosts(60);
  for (let i = 0; i < pending.length; i += 20) {
    const group = pending.slice(i, i + 20).map((p) => ({ ...p, text: p.text.slice(0, 500) }));
    const scores = await curator.screenPosts(group);
    await repo.savePostScores(scores);
    report.screened += scores.length;
    report.accepted += scores.filter((s) => s.accept).length;
  }
}

async function vetPeople(repo: Repo, curator: Curator, report: ReadsReport, now: number) {
  const [pending, topics] = await Promise.all([repo.feeds('pending', 'bsky'), repo.topics()]);
  const topicName = new Map(topics.map((t) => [t.id, t.name]));
  const batch = pending.slice(0, 30);
  for (let i = 0; i < batch.length; i += 15) {
    const group = batch.slice(i, i + 15).map((f) => {
      const meta = JSON.parse(f.meta || '{}');
      return {
        id: f.id, title: `${f.title}${meta.bio ? ` — ${meta.bio}` : ''}`, topic: topicName.get(f.topic_id) ?? '', subscribers: meta.followers ?? 0,
        recentTitles: (meta.recent ?? []).map((r: any) => ({ title: r.text, daysAgo: Math.round((now - r.publishedAt) / DAY) })),
      };
    });
    const scores = await curator.scoreChannels(group);
    for (const s of scores) {
      const g = group.find((x) => x.id === s.id)!;
      if (!g.recentTitles.some((t: { daysAgo: number }) => t.daysAgo <= 30)) { s.accept = false; s.reason = `inactive: ${s.reason}`; }
    }
    await repo.saveFeedScores(scores);
    report.vetted += scores.length;
  }
}

// Find Bluesky people for followed topics that are short of them (once a day per topic).
async function discoverPeople(repo: Repo, get: (u: string) => Promise<Response>, report: ReadsReport, now: number) {
  const [topics, counts, known] = await Promise.all([repo.followedTopics(), repo.bskyCountByTopic(), repo.knownFeedIds()]);
  const due = topics.filter((t) => (counts.get(t.id) ?? 0) < TARGET_BSKY_PER_TOPIC
    && (!t.last_bsky_discovered_at || now - t.last_bsky_discovered_at >= DAY)).slice(0, DISCOVER_TOPICS_PER_RUN);
  for (const t of due) {
    const q = t.name.replace(/&/g, ' ');
    const { actors = [] } = await (await get(`${BSKY}/app.bsky.actor.searchActors?q=${encodeURIComponent(q)}&limit=25`)).json<any>();
    await repo.markBskyDiscovered(t.id, now);
    for (const a of actors.filter((a: any) => !known.has(`bsky:${a.did}`)).slice(0, 6)) {
      const feed = await (await get(`${BSKY}/app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(a.did)}&limit=15&filter=posts_no_replies`)).json<any>().catch(() => ({}));
      const recent = postsFromAuthorFeed(feed).map((p) => ({ text: p.title ? `${p.title}: ${p.text}` : p.text, publishedAt: p.publishedAt }));
      await repo.insertFeeds([{
        id: `bsky:${a.did}`, kind: 'bsky', title: a.displayName || a.handle, url: `https://bsky.app/profile/${a.handle}`,
        topic_id: t.id, thumb: a.avatar ?? null, discovered_at: now,
        meta: JSON.stringify({ handle: a.handle, did: a.did, bio: cleanText(a.description ?? '', 200), recent: recent.slice(0, 10) }),
      }]);
      known.add(`bsky:${a.did}`);
      report.discovered++;
    }
  }
}

async function fetchFeeds(repo: Repo, get: (u: string) => Promise<Response>, report: ReadsReport, now: number) {
  const due = (await repo.feeds('active'))
    .filter((f) => !f.last_fetched_at || now - f.last_fetched_at >= REFETCH[f.kind])
    .sort((a, b) => (a.last_fetched_at ?? 0) - (b.last_fetched_at ?? 0))
    .slice(0, FEEDS_PER_RUN);
  for (const f of due) {
    let posts: RawPost[] = [];
    try {
      posts = await readFeed(f, get);
    } catch (e) {
      if (e instanceof CallLimitReached) throw e;
      console.log('feed failed', f.id, String(e)); // a broken feed shouldn't block the rest
    }
    const fresh = posts.filter((p) => now - p.publishedAt <= 21 * DAY && p.publishedAt <= now + HOUR)
      .sort((a, b) => b.publishedAt - a.publishedAt).slice(0, NEW_POSTS_PER_FEED);
    const known = await repo.knownPostIds(fresh.map((p) => p.id));
    const added = fresh.filter((p) => !known.has(p.id));
    await repo.insertPosts(f, added);
    report.newPosts += added.length;
    await repo.markFeedFetched(f.id, now);
  }
}

async function readFeed(f: Feed, get: (u: string) => Promise<Response>): Promise<RawPost[]> {
  if (f.kind === 'hn') return postsFromHN(await (await get(f.url)).json());
  if (f.kind === 'bsky') {
    const did = JSON.parse(f.meta).did;
    return postsFromAuthorFeed(await (await get(`${BSKY}/app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(did)}&limit=20&filter=posts_no_replies`)).json());
  }
  // RSS ids are namespaced per feed so two feeds can't collide.
  return parseFeed(await (await get(f.url)).text()).map((p) => ({ ...p, id: `${f.id}:${p.id}`, author: p.author ?? f.title }));
}
