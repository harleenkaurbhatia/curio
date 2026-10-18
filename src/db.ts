import type { Candidate, Weights } from './core/ranking';

export type Mode = 'catchup' | 'learn' | 'unwind';
export type Topic = { id: number; name: string; mode: Mode; query_en: string; query_hi: string; active: number; last_discovered_at: number | null };
export type Channel = {
  id: string; title: string; topic_id: number; thumb: string | null; language: string | null;
  score: number | null; reason: string | null; status: 'pending' | 'active' | 'rejected' | 'removed';
  uploads_playlist: string; sample_titles: string; discovered_at: number; last_fetched_at: number | null;
};
export type NewVideo = { id: string; channel_id: string; topic_id: number; title: string; published_at: number; duration_s: number };
export type FeedVideo = Candidate & { title: string; channelTitle: string; topicName: string };

// YouTube quota resets at midnight Pacific time.
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });

export class Repo {
  constructor(private db: D1Database) {}

  // Topics
  async topics(activeOnly = false) {
    const sql = `SELECT * FROM topics ${activeOnly ? 'WHERE active = 1' : ''} ORDER BY id`;
    return (await this.db.prepare(sql).all<Topic>()).results;
  }
  async addTopic(name: string, mode: Mode) {
    await this.db
      .prepare('INSERT INTO topics (name, mode, query_en, query_hi) VALUES (?, ?, ?, ?)')
      .bind(name, mode, `${name} explained`, `${name} hindi`)
      .run();
  }
  async markDiscovered(id: number, at: number) {
    await this.db.prepare('UPDATE topics SET last_discovered_at = ? WHERE id = ?').bind(at, id).run();
  }
  async setTopicActive(id: number, active: boolean) {
    await this.db.prepare('UPDATE topics SET active = ? WHERE id = ?').bind(active ? 1 : 0, id).run();
  }

  // Channels
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
  async insertChannels(chs: Omit<Channel, 'language' | 'score' | 'reason' | 'status' | 'last_fetched_at'>[]) {
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
  async removeChannel(id: string) {
    await this.db.batch([
      this.db.prepare(`UPDATE channels SET status = 'removed' WHERE id = ?`).bind(id),
      this.db.prepare('DELETE FROM videos WHERE channel_id = ?').bind(id),
    ]);
  }
  async markFetched(id: string, at: number) {
    await this.db.prepare('UPDATE channels SET last_fetched_at = ? WHERE id = ?').bind(at, id).run();
  }

  // Videos
  async knownVideoIds(ids: string[]): Promise<Set<string>> {
    if (!ids.length) return new Set();
    const rows = (await this.db
      .prepare(`SELECT id FROM videos WHERE id IN (${ids.map(() => '?').join(',')})`)
      .bind(...ids).all<{ id: string }>()).results;
    return new Set(rows.map((r) => r.id));
  }
  async insertVideos(vs: NewVideo[]) {
    if (!vs.length) return;
    const now = Date.now();
    await this.db.batch(vs.map((v) => this.db
      .prepare(`INSERT OR IGNORE INTO videos (id, channel_id, topic_id, title, published_at, duration_s, added_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(v.id, v.channel_id, v.topic_id, v.title, v.published_at, v.duration_s, now)));
  }

  // Unseen videos from active creators in active topics, published in the last 21 days.
  async candidatePool(now: number, modes?: Mode[]): Promise<FeedVideo[]> {
    const modeSql = modes?.length ? `AND t.mode IN (${modes.map(() => '?').join(',')})` : '';
    const rows = (await this.db
      .prepare(`SELECT v.id, v.title, v.channel_id, v.published_at, c.title AS channel_title, c.score,
                       t.id AS topic_id, t.name AS topic_name, t.mode
                FROM videos v
                JOIN channels c ON c.id = v.channel_id AND c.status = 'active'
                JOIN topics t ON t.id = v.topic_id AND t.active = 1
                LEFT JOIN seen s ON s.video_id = v.id
                WHERE s.video_id IS NULL AND v.published_at > ? ${modeSql}`)
      .bind(now - 21 * 86_400_000, ...(modes ?? []))
      .all<{ id: string; title: string; channel_id: string; published_at: number; channel_title: string;
             score: number | null; topic_id: number; topic_name: string; mode: Mode }>()).results;
    return rows.map((r) => ({
      id: r.id, channelId: r.channel_id, topic: String(r.topic_id), news: r.mode === 'catchup',
      publishedAt: r.published_at, channelScore: r.score ?? 0.6,
      title: r.title, channelTitle: r.channel_title, topicName: r.topic_name,
    }));
  }
  async markSeen(ids: string[]) {
    if (!ids.length) return;
    const now = Date.now();
    await this.db.batch(ids.map((id) => this.db.prepare('INSERT OR IGNORE INTO seen (video_id, at) VALUES (?, ?)').bind(id, now)));
  }

  // Feedback + weights
  async recordFeedback(f: { videoId: string; channelId: string; topicId: number; rating: 1 | -1 }) {
    await this.db
      .prepare('INSERT OR REPLACE INTO feedback (video_id, channel_id, topic_id, rating, at) VALUES (?, ?, ?, ?, ?)')
      .bind(f.videoId, f.channelId, f.topicId, f.rating, Date.now()).run();
  }
  async loadWeights(): Promise<Weights> {
    const rows = (await this.db.prepare('SELECT kind, key, value FROM weights').all<{ kind: string; key: string; value: number }>()).results;
    const w: Weights = { topic: {}, channel: {} };
    for (const r of rows) (r.kind === 'topic' ? w.topic : w.channel)[r.key] = r.value;
    return w;
  }
  async saveWeights(w: Weights, keys: { topic: string; channel: string }) {
    await this.db.batch([
      this.db.prepare('INSERT OR REPLACE INTO weights (kind, key, value) VALUES (?, ?, ?)').bind('topic', keys.topic, w.topic[keys.topic]),
      this.db.prepare('INSERT OR REPLACE INTO weights (kind, key, value) VALUES (?, ?, ?)').bind('channel', keys.channel, w.channel[keys.channel]),
    ]);
  }

  // Quota
  async quotaUsed(): Promise<number> {
    const r = await this.db.prepare('SELECT used FROM quota WHERE day = ?').bind(today()).first<{ used: number }>();
    return r?.used ?? 0;
  }
  async saveQuota(used: number) {
    await this.db.prepare('INSERT OR REPLACE INTO quota (day, used) VALUES (?, ?)').bind(today(), used).run();
  }
}
