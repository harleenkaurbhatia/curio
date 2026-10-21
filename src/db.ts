import type { InboxItem } from './core/instagram';
import type { Candidate, Weights } from './core/ranking';
import type { View } from './core/insights';
import type { RawPost } from './core/sources';

export type Mode = 'catchup' | 'learn' | 'unwind';
export type Topic = {
  id: number; name: string; mode: Mode; query_en: string; query_hi: string; active: number;
  last_discovered_at: number | null; last_bsky_discovered_at: number | null; created_by: number | null; long_videos: number;
};
export type User = { id: number; email: string; name: string; languages: string; tz_offset: number; onboarded: number };
export type Channel = {
  id: string; title: string; topic_id: number; thumb: string | null; language: string | null;
  score: number | null; reason: string | null; status: 'pending' | 'active' | 'rejected';
  uploads_playlist: string; sample_titles: string; discovered_at: number; last_fetched_at: number | null;
};
export type Feed = {
  id: string; kind: 'rss' | 'bsky' | 'hn'; title: string; url: string; topic_id: number; thumb: string | null;
  score: number | null; reason: string | null; status: 'pending' | 'active' | 'rejected'; meta: string;
  discovered_at: number; last_fetched_at: number | null;
};
export type IgAccount = { ig_id: string; user_id: number; username: string | null; token: string; token_refreshed_at: number };
export type IgSender = { ig_id: string; name: string | null; username: string | null; pic: string | null; fetched_at: number };
export type NewVideo = { id: string; channel_id: string; topic_id: number; title: string; published_at: number; duration_s: number; vertical: boolean; full_id?: string | null };
export type FeedItem = Candidate & {
  kind: 'video' | 'post'; title: string; source: string; topicName: string; url: string; vertical?: boolean; fullUrl?: string; hasFull?: boolean;
  text?: string; image?: string | null; author?: string | null; hook?: string | null; sourceKind?: string;
};
export type Snapshot = { kind: 'video' | 'post'; title: string; url: string; source: string; topicName: string; text?: string; image?: string | null };

const DAY = 86_400_000;
const placeholders = (n: number) => Array.from({ length: n }, () => '?').join(',');
// YouTube quota resets at midnight Pacific time.
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });

export class Repo {
  constructor(private db: D1Database) {}

  // ---------- Users & sessions ----------
  async createUser(email: string, name: string, passwordHash: string): Promise<number> {
    const r = await this.db
      .prepare('INSERT INTO users (email, name, password_hash, created_at) VALUES (?, ?, ?, ?) RETURNING id')
      .bind(email, name, passwordHash, Date.now()).first<{ id: number }>();
    return r!.id;
  }
  async userForLogin(email: string) {
    return this.db.prepare('SELECT id, password_hash FROM users WHERE email = ?').bind(email).first<{ id: number; password_hash: string }>();
  }
  async setLogin(id: number, email: string, name: string, passwordHash: string) {
    await this.db.prepare('UPDATE users SET email = ?, name = ?, password_hash = ? WHERE id = ?').bind(email, name, passwordHash, id).run();
  }
  // ---- Instagram inbox ----
  async igAccountFor(userId: number) {
    return this.db.prepare('SELECT ig_id, username FROM ig_accounts WHERE user_id = ?').bind(userId).first<{ ig_id: string; username: string | null }>();
  }
  async igAccount(igId: string) {
    return this.db.prepare('SELECT * FROM ig_accounts WHERE ig_id = ?').bind(igId).first<IgAccount>();
  }
  async igAccountsToRefresh(before: number) {
    return (await this.db.prepare('SELECT * FROM ig_accounts WHERE token_refreshed_at < ?').bind(before).all<IgAccount>()).results;
  }
  async saveIgAccount(a: IgAccount) {
    await this.db.batch([
      this.db.prepare('DELETE FROM ig_accounts WHERE user_id = ? OR ig_id = ?').bind(a.user_id, a.ig_id),
      this.db.prepare('INSERT INTO ig_accounts (ig_id, user_id, username, token, token_refreshed_at) VALUES (?, ?, ?, ?, ?)')
        .bind(a.ig_id, a.user_id, a.username, a.token, a.token_refreshed_at),
    ]);
  }
  async removeIgAccount(userId: number) {
    await this.db.prepare('DELETE FROM ig_accounts WHERE user_id = ?').bind(userId).run();
  }
  async igSender(igId: string) {
    return this.db.prepare('SELECT * FROM ig_senders WHERE ig_id = ?').bind(igId).first<IgSender>();
  }
  async saveIgSender(s: IgSender) {
    await this.db.prepare('INSERT OR REPLACE INTO ig_senders (ig_id, name, username, pic, fetched_at) VALUES (?, ?, ?, ?, ?)')
      .bind(s.ig_id, s.name, s.username, s.pic, s.fetched_at).run();
  }
  async addInbox(userId: number, items: InboxItem[]) {
    if (!items.length) return;
    await this.db.batch(items.map((i) => this.db
      .prepare(`INSERT OR IGNORE INTO inbox (id, user_id, sender_ig_id, kind, media_url, title, media_id, link, text, at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(i.id, userId, i.senderIgId, i.kind, i.mediaUrl, i.title, i.mediaId, i.link, i.text, i.at)));
  }
  async inbox(userId: number) {
    return (await this.db.prepare(`SELECT i.*, s.name AS sender_name, s.username AS sender_username, s.pic AS sender_pic
                                   FROM inbox i LEFT JOIN ig_senders s ON s.ig_id = i.sender_ig_id
                                   WHERE i.user_id = ? ORDER BY i.at DESC LIMIT 100`).bind(userId).all<any>()).results;
  }
  async inboxUnread(userId: number) {
    return (await this.db.prepare('SELECT COUNT(*) AS n FROM inbox WHERE user_id = ? AND seen = 0').bind(userId).first<{ n: number }>())?.n ?? 0;
  }
  async markInboxSeen(userId: number, ids: string[]) {
    if (!ids.length) return;
    await this.db.batch(ids.slice(0, 100).map((id) => this.db.prepare('UPDATE inbox SET seen = 1 WHERE user_id = ? AND id = ?').bind(userId, id)));
  }

  async createSession(tokenHash: string, userId: number, expiresAt: number) {
    await this.db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
      .bind(tokenHash, userId, expiresAt, Date.now()).run();
  }
  async sessionUser(tokenHash: string): Promise<User | null> {
    return this.db.prepare(`SELECT u.id, u.email, u.name, u.languages, u.tz_offset, u.onboarded
                            FROM sessions s JOIN users u ON u.id = s.user_id
                            WHERE s.token_hash = ? AND s.expires_at > ?`)
      .bind(tokenHash, Date.now()).first<User>();
  }
  async deleteSession(tokenHash: string) {
    await this.db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(tokenHash).run();
  }
  async updateUser(id: number, p: { name?: string; languages?: string; tz_offset?: number; onboarded?: boolean }) {
    const sets: string[] = [], vals: unknown[] = [];
    if (p.name !== undefined) { sets.push('name = ?'); vals.push(p.name); }
    if (p.languages !== undefined) { sets.push('languages = ?'); vals.push(p.languages); }
    if (p.tz_offset !== undefined) { sets.push('tz_offset = ?'); vals.push(p.tz_offset); }
    if (p.onboarded !== undefined) { sets.push('onboarded = ?'); vals.push(p.onboarded ? 1 : 0); }
    if (!sets.length) return;
    await this.db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).bind(...vals, id).run();
  }
  async deleteUser(id: number) {
    // Child rows go via ON DELETE CASCADE where enforced; delete explicitly too, since D1 may not enforce FKs.
    await this.db.batch(['sessions', 'user_topics', 'user_blocks', 'views', 'feedback', 'weights', 'saves', 'notes', 'inbox', 'ig_accounts']
      .map((t) => this.db.prepare(`DELETE FROM ${t} WHERE user_id = ?`).bind(id))
      .concat(this.db.prepare('DELETE FROM users WHERE id = ?').bind(id)));
  }

  // ---------- Topics ----------
  async topics() {
    return (await this.db.prepare('SELECT * FROM topics WHERE active = 1 ORDER BY id').all<Topic>()).results;
  }
  async topicsFor(userId: number) {
    return (await this.db.prepare(`SELECT t.id, t.name, t.mode, t.created_by, ut.user_id IS NOT NULL AS following
                                   FROM topics t LEFT JOIN user_topics ut ON ut.topic_id = t.id AND ut.user_id = ?
                                   WHERE t.active = 1 ORDER BY t.id`)
      .bind(userId).all<{ id: number; name: string; mode: Mode; created_by: number | null; following: number }>()).results;
  }
  async followedTopics() {
    return (await this.db.prepare('SELECT * FROM topics WHERE active = 1 AND id IN (SELECT topic_id FROM user_topics) ORDER BY id').all<Topic>()).results;
  }
  async setFollow(userId: number, topicId: number, on: boolean) {
    await this.db.prepare(on
      ? 'INSERT OR IGNORE INTO user_topics (user_id, topic_id) VALUES (?, ?)'
      : 'DELETE FROM user_topics WHERE user_id = ? AND topic_id = ?').bind(userId, topicId).run();
  }
  async followAll(userId: number, topicIds: number[]) {
    await this.db.batch([
      this.db.prepare('DELETE FROM user_topics WHERE user_id = ?').bind(userId),
      ...topicIds.map((t) => this.db.prepare('INSERT OR IGNORE INTO user_topics (user_id, topic_id) VALUES (?, ?)').bind(userId, t)),
    ]);
  }
  async customTopicCount(userId: number) {
    return (await this.db.prepare('SELECT COUNT(*) n FROM topics WHERE created_by = ?').bind(userId).first<{ n: number }>())!.n;
  }
  // Returns the topic id, reusing an existing topic of the same name.
  async addTopic(name: string, mode: Mode, userId: number): Promise<number> {
    const existing = await this.db.prepare('SELECT id FROM topics WHERE name = ? COLLATE NOCASE').bind(name).first<{ id: number }>();
    if (existing) return existing.id;
    const r = await this.db
      .prepare('INSERT INTO topics (name, mode, query_en, query_hi, created_by) VALUES (?, ?, ?, ?, ?) RETURNING id')
      .bind(name, mode, `${name} explained`, `${name} hindi`, userId).first<{ id: number }>();
    return r!.id;
  }
  async markDiscovered(id: number, at: number) {
    await this.db.prepare('UPDATE topics SET last_discovered_at = ? WHERE id = ?').bind(at, id).run();
  }
  async markBskyDiscovered(id: number, at: number) {
    await this.db.prepare('UPDATE topics SET last_bsky_discovered_at = ? WHERE id = ?').bind(at, id).run();
  }

  // ---------- YouTube channels ----------
  async channels(status?: Channel['status']) {
    const q = status
      ? this.db.prepare('SELECT * FROM channels WHERE status = ? ORDER BY score DESC').bind(status)
      : this.db.prepare('SELECT * FROM channels ORDER BY score DESC');
    return (await q.all<Channel>()).results;
  }
  async knownChannelIds(): Promise<Set<string>> {
    const rows = (await this.db.prepare('SELECT id FROM channels').all<{ id: string }>()).results;
    return new Set(rows.map((r) => r.id));
  }
  async activeCountByTopic(): Promise<Map<number, number>> {
    const rows = (await this.db
      .prepare(`SELECT topic_id, COUNT(*) n FROM channels WHERE status IN ('active','pending') GROUP BY topic_id`)
      .all<{ topic_id: number; n: number }>()).results;
    return new Map(rows.map((r) => [r.topic_id, r.n]));
  }
  async insertChannels(chs: Pick<Channel, 'id' | 'title' | 'topic_id' | 'thumb' | 'uploads_playlist' | 'sample_titles' | 'discovered_at'>[]) {
    if (!chs.length) return;
    await this.db.batch(chs.map((c) => this.db
      .prepare(`INSERT OR IGNORE INTO channels (id, title, topic_id, thumb, uploads_playlist, sample_titles, discovered_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(c.id, c.title, c.topic_id, c.thumb, c.uploads_playlist, c.sample_titles, c.discovered_at)));
  }
  async saveScores(scores: { id: string; score: number; language: string; reason: string; accept: boolean }[]) {
    if (!scores.length) return;
    await this.db.batch(scores.map((s) => this.db
      .prepare(`UPDATE channels SET score = ?, language = ?, reason = ?, status = ? WHERE id = ? AND status = 'pending'`)
      .bind(s.score, s.language, s.reason, s.accept ? 'active' : 'rejected', s.id)));
  }
  async markFetched(id: string, at: number) {
    await this.db.prepare('UPDATE channels SET last_fetched_at = ? WHERE id = ?').bind(at, id).run();
  }

  // ---------- Feeds (Bluesky people, RSS, HN) ----------
  async feeds(status?: Feed['status'], kind?: Feed['kind']) {
    const where = [status && 'status = ?', kind && 'kind = ?'].filter(Boolean).join(' AND ');
    const q = this.db.prepare(`SELECT * FROM feeds ${where ? `WHERE ${where}` : ''} ORDER BY score DESC`);
    return (await q.bind(...[status, kind].filter(Boolean)).all<Feed>()).results;
  }
  async knownFeedIds(): Promise<Set<string>> {
    return new Set((await this.db.prepare('SELECT id FROM feeds').all<{ id: string }>()).results.map((r) => r.id));
  }
  async bskyCountByTopic(): Promise<Map<number, number>> {
    const rows = (await this.db
      .prepare(`SELECT topic_id, COUNT(*) n FROM feeds WHERE kind = 'bsky' AND status IN ('active','pending') GROUP BY topic_id`)
      .all<{ topic_id: number; n: number }>()).results;
    return new Map(rows.map((r) => [r.topic_id, r.n]));
  }
  async insertFeeds(fs: Pick<Feed, 'id' | 'kind' | 'title' | 'url' | 'topic_id' | 'thumb' | 'meta' | 'discovered_at'>[]) {
    if (!fs.length) return;
    await this.db.batch(fs.map((f) => this.db
      .prepare('INSERT OR IGNORE INTO feeds (id, kind, title, url, topic_id, thumb, meta, discovered_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(f.id, f.kind, f.title, f.url, f.topic_id, f.thumb, f.meta, f.discovered_at)));
  }
  async saveFeedScores(scores: { id: string; score: number; reason: string; accept: boolean }[]) {
    if (!scores.length) return;
    await this.db.batch(scores.map((s) => this.db
      .prepare(`UPDATE feeds SET score = ?, reason = ?, status = ? WHERE id = ? AND status = 'pending'`)
      .bind(s.score, s.reason, s.accept ? 'active' : 'rejected', s.id)));
  }
  async markFeedFetched(id: string, at: number) {
    await this.db.prepare('UPDATE feeds SET last_fetched_at = ? WHERE id = ?').bind(at, id).run();
  }

  // ---------- Posts ----------
  async knownPostIds(ids: string[]): Promise<Set<string>> {
    if (!ids.length) return new Set();
    const rows = (await this.db.prepare(`SELECT id FROM posts WHERE id IN (${placeholders(ids.length)})`).bind(...ids).all<{ id: string }>()).results;
    return new Set(rows.map((r) => r.id));
  }
  async insertPosts(feed: Feed, posts: RawPost[]) {
    if (!posts.length) return;
    const now = Date.now();
    await this.db.batch(posts.map((p) => this.db
      .prepare(`INSERT OR IGNORE INTO posts (id, feed_id, topic_id, title, text, url, image, author, published_at, added_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(p.id, feed.id, feed.topic_id, p.title, p.text, p.url, p.image ?? null, p.author ?? null, p.publishedAt, now)));
  }
  async pendingPosts(limit: number) {
    return (await this.db.prepare(`SELECT p.id, p.title, p.text, p.author, f.title AS source, t.name AS topic
                                   FROM posts p JOIN feeds f ON f.id = p.feed_id JOIN topics t ON t.id = p.topic_id
                                   WHERE p.status = 'pending' ORDER BY p.published_at DESC LIMIT ?`)
      .bind(limit).all<{ id: string; title: string; text: string; author: string | null; source: string; topic: string }>()).results;
  }
  async savePostScores(scores: { id: string; score: number; accept: boolean; hook: string }[]) {
    if (!scores.length) return;
    await this.db.batch(scores.map((s) => this.db
      .prepare(`UPDATE posts SET score = ?, hook = ?, status = ? WHERE id = ?`)
      .bind(s.score, s.hook, s.accept ? 'ok' : 'rejected', s.id)));
  }

  // ---------- Videos ----------
  async knownVideoIds(ids: string[]): Promise<Set<string>> {
    if (!ids.length) return new Set();
    const rows = (await this.db.prepare(`SELECT id FROM videos WHERE id IN (${placeholders(ids.length)})`).bind(...ids).all<{ id: string }>()).results;
    return new Set(rows.map((r) => r.id));
  }
  async insertVideos(vs: NewVideo[]) {
    if (!vs.length) return;
    const now = Date.now();
    await this.db.batch(vs.map((v) => this.db
      .prepare(`INSERT OR IGNORE INTO videos (id, channel_id, topic_id, title, published_at, duration_s, vertical, full_id, added_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(v.id, v.channel_id, v.topic_id, v.title, v.published_at, v.duration_s, v.vertical ? 1 : 0, v.full_id ?? null, now)));
  }

  // ---------- Feed ----------
  // Unseen, fresh items from followed topics, minus blocked sources; videos filtered by the user's languages.
  async candidatePool(user: User, now: number): Promise<FeedItem[]> {
    const since = now - 21 * DAY;
    const langs = user.languages.split(',').filter(Boolean);
    const [videos, posts] = await Promise.all([
      this.db.prepare(`SELECT v.id, v.title, v.channel_id AS source_id, v.published_at, v.vertical, v.full_id, c.title AS source, c.score,
                              t.id AS topic_id, t.name AS topic_name, t.mode
                       FROM videos v
                       JOIN channels c ON c.id = v.channel_id AND c.status = 'active'
                       JOIN topics t ON t.id = v.topic_id AND t.active = 1
                       JOIN user_topics ut ON ut.topic_id = t.id AND ut.user_id = ?1
                       WHERE v.published_at > ?2
                         AND (c.language IS NULL OR c.language IN (${langs.map((_, i) => `?${i + 3}`).join(',') || "''"}))
                         AND NOT EXISTS (SELECT 1 FROM views w WHERE w.user_id = ?1 AND w.item_id = v.id)
                         AND NOT EXISTS (SELECT 1 FROM user_blocks b WHERE b.user_id = ?1 AND b.source_id = v.channel_id)`)
        .bind(user.id, since, ...langs).all<any>(),
      this.db.prepare(`SELECT p.id, p.title, p.text, p.url, p.image, p.author, p.hook, p.feed_id AS source_id, p.published_at,
                              p.score AS post_score, f.title AS source, f.kind AS source_kind, f.score,
                              t.id AS topic_id, t.name AS topic_name, t.mode
                       FROM posts p
                       JOIN feeds f ON f.id = p.feed_id AND f.status = 'active'
                       JOIN topics t ON t.id = p.topic_id AND t.active = 1
                       JOIN user_topics ut ON ut.topic_id = t.id AND ut.user_id = ?1
                       WHERE p.status = 'ok' AND p.published_at > ?2
                         AND NOT EXISTS (SELECT 1 FROM views w WHERE w.user_id = ?1 AND w.item_id = p.id)
                         AND NOT EXISTS (SELECT 1 FROM user_blocks b WHERE b.user_id = ?1 AND b.source_id = p.feed_id)`)
        .bind(user.id, since).all<any>(),
    ]);
    const common = (r: any) => ({
      id: r.id, channelId: r.source_id, topic: String(r.topic_id), news: r.mode === 'catchup', publishedAt: r.published_at,
      title: r.title, source: r.source, topicName: r.topic_name,
    });
    return [
      ...videos.results.map((r) => ({ ...common(r), kind: 'video' as const, channelScore: r.score ?? 0.6, vertical: !!r.vertical,
        url: r.vertical ? `https://www.youtube.com/shorts/${r.id}` : `https://www.youtube.com/watch?v=${r.id}`,
        // Where "View full video" goes: the full video a Short links to, else this video on YouTube.
        fullUrl: `https://www.youtube.com/watch?v=${r.full_id ?? r.id}`, hasFull: !!r.full_id })),
      ...posts.results.map((r) => ({
        ...common(r), kind: 'post' as const,
        // A great post from an average source still deserves a chance.
        channelScore: Math.max(r.score ?? 0.6, r.post_score ?? 0.6),
        url: r.url, text: r.text, image: r.image, author: r.author, hook: r.hook, sourceKind: r.source_kind,
      })),
    ];
  }

  // ---------- Views (seen + time spent) ----------
  async recordViews(userId: number, vs: { itemId: string; topicId: number; kind: 'video' | 'post'; ms: number }[]) {
    if (!vs.length) return;
    const now = Date.now();
    await this.db.batch(vs.map((v) => this.db
      .prepare(`INSERT INTO views (user_id, item_id, topic_id, kind, ms, at) VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT (user_id, item_id) DO UPDATE SET ms = views.ms + excluded.ms`)
      .bind(userId, v.itemId, v.topicId, v.kind, v.ms, now)));
  }
  async viewsSince(userId: number, since: number): Promise<View[]> {
    return (await this.db.prepare(`SELECT COALESCE(t.name, 'Other') AS topic, w.kind, w.ms, w.at
                                   FROM views w LEFT JOIN topics t ON t.id = w.topic_id
                                   WHERE w.user_id = ? AND w.at > ?`)
      .bind(userId, since).all<View>()).results;
  }
  async totals(userId: number) {
    return (await this.db.prepare(`SELECT
        (SELECT COUNT(*) FROM feedback WHERE user_id = ?1 AND rating = 1) AS likes,
        (SELECT COUNT(*) FROM saves WHERE user_id = ?1 AND list = 'saved') AS saved,
        (SELECT COUNT(*) FROM notes WHERE user_id = ?1) AS thoughts,
        (SELECT COUNT(*) FROM views WHERE user_id = ?1) AS allTime`)
      .bind(userId).first<{ likes: number; saved: number; thoughts: number; allTime: number }>())!;
  }

  // ---------- Feedback & weights ----------
  async recordFeedback(userId: number, f: { itemId: string; sourceId: string; topicId: number; rating: 1 | -1 }) {
    await this.db
      .prepare('INSERT OR REPLACE INTO feedback (user_id, item_id, source_id, topic_id, rating, at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(userId, f.itemId, f.sourceId, f.topicId, f.rating, Date.now()).run();
  }
  async loadWeights(userId: number): Promise<Weights> {
    const rows = (await this.db.prepare('SELECT kind, key, value FROM weights WHERE user_id = ?').bind(userId)
      .all<{ kind: string; key: string; value: number }>()).results;
    const w: Weights = { topic: {}, channel: {} };
    for (const r of rows) (r.kind === 'topic' ? w.topic : w.channel)[r.key] = r.value;
    return w;
  }
  async saveWeights(userId: number, w: Weights, keys: { topic: string; channel: string }) {
    const put = 'INSERT OR REPLACE INTO weights (user_id, kind, key, value) VALUES (?, ?, ?, ?)';
    await this.db.batch([
      this.db.prepare(put).bind(userId, 'topic', keys.topic, w.topic[keys.topic]),
      this.db.prepare(put).bind(userId, 'channel', keys.channel, w.channel[keys.channel]),
    ]);
  }

  async saveWeightKeys(userId: number, w: Weights, topics: string[], channels: string[]) {
    const put = 'INSERT OR REPLACE INTO weights (user_id, kind, key, value) VALUES (?, ?, ?, ?)';
    const rows = [...topics.map((k) => this.db.prepare(put).bind(userId, 'topic', k, w.topic[k])),
      ...channels.map((k) => this.db.prepare(put).bind(userId, 'channel', k, w.channel[k]))];
    if (rows.length) await this.db.batch(rows);
  }

  // ---------- Creators (per-user hide) ----------
  async sourcesFor(userId: number) {
    return (await this.db.prepare(`
      SELECT * FROM (
        SELECT c.id, c.title, c.topic_id, c.thumb, c.reason, c.score, 'youtube' AS kind FROM channels c WHERE c.status = 'active'
        UNION ALL
        SELECT f.id, f.title, f.topic_id, f.thumb, f.reason, f.score, f.kind FROM feeds f WHERE f.status = 'active'
      ) s
      WHERE s.topic_id IN (SELECT topic_id FROM user_topics WHERE user_id = ?1)
        AND s.id NOT IN (SELECT source_id FROM user_blocks WHERE user_id = ?1)
      ORDER BY s.topic_id, s.score DESC`)
      .bind(userId).all<{ id: string; title: string; topic_id: number; thumb: string | null; reason: string | null; score: number | null; kind: string }>()).results;
  }
  async block(userId: number, sourceId: string) {
    await this.db.prepare('INSERT OR IGNORE INTO user_blocks (user_id, source_id) VALUES (?, ?)').bind(userId, sourceId).run();
  }

  // ---------- Library ----------
  async addToList(userId: number, itemId: string, list: 'saved' | 'later', snap: Snapshot) {
    await this.db.prepare('INSERT OR REPLACE INTO saves (user_id, item_id, list, snapshot, at) VALUES (?, ?, ?, ?, ?)')
      .bind(userId, itemId, list, JSON.stringify(snap), Date.now()).run();
  }
  async removeFromList(userId: number, itemId: string, list: 'saved' | 'later') {
    await this.db.prepare('DELETE FROM saves WHERE user_id = ? AND item_id = ? AND list = ?').bind(userId, itemId, list).run();
  }
  async library(userId: number) {
    const [saves, notes] = await Promise.all([
      this.db.prepare('SELECT item_id, list, snapshot, at FROM saves WHERE user_id = ? ORDER BY at DESC').bind(userId)
        .all<{ item_id: string; list: string; snapshot: string; at: number }>(),
      this.db.prepare('SELECT id, item_id, snapshot, text, at FROM notes WHERE user_id = ? ORDER BY at DESC').bind(userId)
        .all<{ id: number; item_id: string | null; snapshot: string | null; text: string; at: number }>(),
    ]);
    const parse = (s: string | null) => (s ? JSON.parse(s) : null);
    const items = saves.results.map((s) => ({ itemId: s.item_id, list: s.list, at: s.at, item: parse(s.snapshot) }));
    return {
      saved: items.filter((i) => i.list === 'saved'),
      later: items.filter((i) => i.list === 'later'),
      thoughts: notes.results.map((n) => ({ id: n.id, itemId: n.item_id, text: n.text, at: n.at, item: parse(n.snapshot) })),
    };
  }
  // A creator's or site's page: who they are and their latest items, like an Instagram profile.
  async sourceProfile(id: string) {
    const ch = await this.db.prepare(`SELECT c.id, c.title, c.thumb, c.sample_titles, t.name AS topic_name FROM channels c
                                      JOIN topics t ON t.id = c.topic_id WHERE c.id = ?`).bind(id).first<any>();
    if (ch) {
      let subscribers: number | null = null;
      try { subscribers = Number(JSON.parse(ch.sample_titles)?.subscribers) || null; } catch { /* old format */ }
      const vids = (await this.db.prepare(`SELECT id, title, published_at, vertical, full_id FROM videos WHERE channel_id = ?
                                           ORDER BY published_at DESC LIMIT 30`).bind(id).all<any>()).results;
      return {
        kind: 'channel' as const, id, title: ch.title, thumb: ch.thumb, topicName: ch.topic_name, subscribers,
        url: `https://www.youtube.com/channel/${encodeURIComponent(id)}`,
        items: vids.map((v) => ({
          id: v.id, kind: 'video' as const, title: v.title, source: ch.title, topicName: ch.topic_name, publishedAt: v.published_at,
          vertical: !!v.vertical, url: v.vertical ? `https://www.youtube.com/shorts/${v.id}` : `https://www.youtube.com/watch?v=${v.id}`,
        })),
      };
    }
    const f = await this.db.prepare(`SELECT f.id, f.kind, f.title, f.url, f.thumb, t.name AS topic_name FROM feeds f
                                     JOIN topics t ON t.id = f.topic_id WHERE f.id = ?`).bind(id).first<any>();
    if (!f) return null;
    const posts = (await this.db.prepare(`SELECT id, title, text, url, image, published_at FROM posts WHERE feed_id = ? AND status = 'ok'
                                          ORDER BY published_at DESC LIMIT 30`).bind(id).all<any>()).results;
    let site = f.url;
    try { site = f.kind === 'hn' ? 'https://news.ycombinator.com' : new URL(f.url).origin; } catch { /* keep */ }
    return {
      kind: 'feed' as const, id, title: f.title, thumb: f.thumb, topicName: f.topic_name, subscribers: null, url: site,
      items: posts.map((p) => ({ id: p.id, kind: 'post' as const, title: p.title, text: p.text, image: p.image, url: p.url,
        source: f.title, topicName: f.topic_name, publishedAt: p.published_at })),
    };
  }

  async addNote(userId: number, text: string, itemId: string | null, snap: Snapshot | null) {
    const r = await this.db.prepare('INSERT INTO notes (user_id, item_id, snapshot, text, at) VALUES (?, ?, ?, ?, ?) RETURNING id')
      .bind(userId, itemId, snap ? JSON.stringify(snap) : null, text, Date.now()).first<{ id: number }>();
    return r!.id;
  }
  async deleteNote(userId: number, id: number) {
    await this.db.prepare('DELETE FROM notes WHERE id = ? AND user_id = ?').bind(id, userId).run();
  }

  // ---------- Quota ----------
  async quotaUsed(): Promise<{ used: number; searches: number }> {
    const r = await this.db.prepare('SELECT used, searches FROM quota WHERE day = ?').bind(today()).first<{ used: number; searches: number }>();
    return { used: r?.used ?? 0, searches: r?.searches ?? 0 };
  }
  async saveQuota(used: number, searches: number) {
    await this.db.prepare('INSERT OR REPLACE INTO quota (day, used, searches) VALUES (?, ?, ?)').bind(today(), used, searches).run();
  }
}
