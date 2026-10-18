import { Hono } from 'hono';
import { EMAIL_RE, issueSession, sessionCookie, tokenFrom } from './auth';
import { hashPassword, sha256, verifyPassword } from './core/password';
import { guestEmail, isGuest } from './core/guest';
import { Repo, type Mode, type Snapshot, type User } from './db';
import { buildFeed } from './core/ranking';
import { applyFeedback } from './core/feedback';
import { computeInsights } from './core/insights';
import { refreshVideos, type Env } from './jobs/refresh';
import { refreshReads } from './jobs/reads';

type Vars = { user: User; repo: Repo };
const app = new Hono<{ Bindings: Env; Variables: Vars }>();
const MODES: Mode[] = ['catchup', 'learn', 'unwind'];
const LANGS = ['en', 'hi', 'hinglish'];
const MAX_CUSTOM_TOPICS = 5;
const isHttps = (url: string) => new URL(url).protocol === 'https:';
const slow = () => new Promise((r) => setTimeout(r, 600)); // blunt password guessing

// New follows shouldn't wait for the next cron run: start finding creators right away.
function kickRefresh(c: { env: Env; executionCtx: { waitUntil(p: Promise<unknown>): void } }) {
  c.executionCtx.waitUntil(refreshVideos(c.env).catch((e) => console.log('kick', String(e))));
}

app.use('/api/*', async (c, next) => {
  c.set('repo', new Repo(c.env.DB));
  await next();
});

// ---------- Auth ----------
app.post('/api/auth/signup', async (c) => {
  const b = await c.req.json<{ name?: string; email?: string; password?: string; tzOffset?: number }>().catch(() => ({} as any));
  const name = String(b.name ?? '').trim().slice(0, 60);
  const email = String(b.email ?? '').trim().toLowerCase();
  const password = String(b.password ?? '');
  if (!name) return c.json({ error: 'Please enter your name' }, 400);
  if (!EMAIL_RE.test(email)) return c.json({ error: 'Please enter a valid email' }, 400);
  if (password.length < 8) return c.json({ error: 'Password needs at least 8 characters' }, 400);
  const repo = c.get('repo');
  if (await repo.userForLogin(email)) { await slow(); return c.json({ error: 'An account with this email already exists' }, 409); }
  const id = await repo.createUser(email, name, await hashPassword(password));
  if (Number.isFinite(b.tzOffset)) await repo.updateUser(id, { tz_offset: Math.round(Number(b.tzOffset)) });
  const s = await issueSession();
  await repo.createSession(s.hash, id, s.expiresAt);
  c.header('Set-Cookie', sessionCookie(s.token, isHttps(c.req.url)));
  return c.json({ ok: true });
});

// Start without an account. The client sends interests it kept in localStorage, so a
// returning visitor whose cookie was cleared skips onboarding.
app.post('/api/auth/guest', async (c) => {
  const b = await c.req.json<{ topicIds?: number[]; languages?: string[]; tzOffset?: number }>().catch(() => ({} as any));
  const repo = c.get('repo');
  const id = await repo.createUser(guestEmail(), 'Guest', '');
  const topicIds = Array.isArray(b.topicIds) ? b.topicIds.map(Number).filter(Number.isFinite).slice(0, 100) : [];
  const langs = Array.isArray(b.languages) ? b.languages.filter((l: string) => LANGS.includes(l)) : [];
  if (topicIds.length) { await repo.followAll(id, topicIds); kickRefresh(c); }
  await repo.updateUser(id, {
    languages: langs.length ? langs.join(',') : undefined,
    tz_offset: Number.isFinite(b.tzOffset) ? Math.round(Number(b.tzOffset)) : undefined,
    onboarded: topicIds.length > 0 && langs.length > 0,
  });
  const s = await issueSession();
  await repo.createSession(s.hash, id, s.expiresAt);
  c.header('Set-Cookie', sessionCookie(s.token, isHttps(c.req.url)));
  return c.json({ ok: true });
});

app.post('/api/auth/login', async (c) => {
  const b = await c.req.json<{ email?: string; password?: string }>().catch(() => ({} as any));
  const repo = c.get('repo');
  const row = await repo.userForLogin(String(b.email ?? '').trim().toLowerCase());
  if (!row || !(await verifyPassword(String(b.password ?? ''), row.password_hash))) {
    await slow();
    return c.json({ error: 'Email or password is incorrect' }, 401);
  }
  const s = await issueSession();
  await repo.createSession(s.hash, row.id, s.expiresAt);
  c.header('Set-Cookie', sessionCookie(s.token, isHttps(c.req.url)));
  return c.json({ ok: true });
});

app.post('/api/auth/logout', async (c) => {
  const token = tokenFrom(c.req.header('Cookie'));
  if (token) await c.get('repo').deleteSession(await sha256(token));
  c.header('Set-Cookie', sessionCookie('', isHttps(c.req.url), 0));
  return c.json({ ok: true });
});

// Manual refresh for the owner (header token), handy right after deploy.
app.post('/api/admin/refresh', async (c) => {
  if (!c.env.ADMIN_TOKEN || c.req.header('x-admin-token') !== c.env.ADMIN_TOKEN) return c.json({ error: 'Forbidden' }, 403);
  const [videos, reads] = await Promise.all([refreshVideos(c.env), refreshReads(c.env)]);
  return c.json({ videos, reads });
});

// Everything below needs a signed-in user.
app.use('/api/*', async (c, next) => {
  const token = tokenFrom(c.req.header('Cookie'));
  const user = token ? await c.get('repo').sessionUser(await sha256(token)) : null;
  if (!user) return c.json({ error: 'Please sign in' }, 401);
  c.set('user', user);
  await next();
});

// ---------- Account ----------
app.get('/api/me', (c) => {
  const { id, ...u } = c.get('user');
  const guest = isGuest(u.email);
  return c.json({ ...u, guest, email: guest ? '' : u.email, languages: u.languages.split(',').filter(Boolean), onboarded: !!u.onboarded });
});

app.patch('/api/me', async (c) => {
  const b = await c.req.json<{ name?: string; languages?: string[]; tzOffset?: number; onboarded?: boolean }>();
  const langs = Array.isArray(b.languages) ? b.languages.filter((l) => LANGS.includes(l)) : undefined;
  if (langs && !langs.length) return c.json({ error: 'Pick at least one language' }, 400);
  await c.get('repo').updateUser(c.get('user').id, {
    name: b.name?.trim().slice(0, 60) || undefined,
    languages: langs?.join(','),
    tz_offset: Number.isFinite(b.tzOffset) ? Math.round(Number(b.tzOffset)) : undefined,
    onboarded: b.onboarded,
  });
  return c.json({ ok: true });
});

// Turn a guest account into a real one, keeping its history, saves and thoughts.
app.post('/api/me/claim', async (c) => {
  const user = c.get('user');
  if (!isGuest(user.email)) return c.json({ error: 'This account already has a login' }, 400);
  const b = await c.req.json<{ name?: string; email?: string; password?: string }>().catch(() => ({} as any));
  const name = String(b.name ?? '').trim().slice(0, 60);
  const email = String(b.email ?? '').trim().toLowerCase();
  const password = String(b.password ?? '');
  if (!name) return c.json({ error: 'Please enter your name' }, 400);
  if (!EMAIL_RE.test(email) || isGuest(email)) return c.json({ error: 'Please enter a valid email' }, 400);
  if (password.length < 8) return c.json({ error: 'Password needs at least 8 characters' }, 400);
  const repo = c.get('repo');
  if (await repo.userForLogin(email)) { await slow(); return c.json({ error: 'An account with this email already exists' }, 409); }
  await repo.setLogin(user.id, email, name, await hashPassword(password));
  return c.json({ ok: true });
});

app.delete('/api/me', async (c) => {
  const { password } = await c.req.json<{ password?: string }>().catch(() => ({ password: '' }));
  const repo = c.get('repo');
  const row = await repo.userForLogin(c.get('user').email);
  const guest = isGuest(c.get('user').email); // guests have no password to confirm with
  if (!row || (!guest && !(await verifyPassword(String(password ?? ''), row.password_hash)))) { await slow(); return c.json({ error: 'Password is incorrect' }, 401); }
  await repo.deleteUser(row.id);
  c.header('Set-Cookie', sessionCookie('', isHttps(c.req.url), 0));
  return c.json({ ok: true });
});

// ---------- Topics ----------
app.get('/api/topics', async (c) => {
  const rows = await c.get('repo').topicsFor(c.get('user').id);
  return c.json(rows.map((t) => ({ id: t.id, name: t.name, mode: t.mode, following: !!t.following, custom: t.created_by === c.get('user').id })));
});

app.put('/api/topics/follow', async (c) => {
  const { topicIds } = await c.req.json<{ topicIds: number[] }>();
  if (!Array.isArray(topicIds) || !topicIds.length) return c.json({ error: 'Pick at least one topic' }, 400);
  await c.get('repo').followAll(c.get('user').id, topicIds.map(Number).filter(Number.isFinite).slice(0, 100));
  kickRefresh(c);
  return c.json({ ok: true });
});

app.patch('/api/topics/:id', async (c) => {
  const { following } = await c.req.json<{ following: boolean }>();
  await c.get('repo').setFollow(c.get('user').id, Number(c.req.param('id')), !!following);
  kickRefresh(c);
  return c.json({ ok: true });
});

app.post('/api/topics', async (c) => {
  const { name, mode } = await c.req.json<{ name: string; mode: Mode }>();
  const clean = String(name ?? '').trim().replace(/\s+/g, ' ').slice(0, 40);
  if (!clean || !MODES.includes(mode)) return c.json({ error: 'Give the topic a name and pick a mode' }, 400);
  const repo = c.get('repo'), user = c.get('user');
  if ((await repo.customTopicCount(user.id)) >= MAX_CUSTOM_TOPICS) return c.json({ error: `You can add up to ${MAX_CUSTOM_TOPICS} topics of your own` }, 429);
  const id = await repo.addTopic(clean, mode, user.id);
  await repo.setFollow(user.id, id, true);
  return c.json({ ok: true, id });
});

// ---------- Feed ----------
app.get('/api/feed', async (c) => {
  const repo = c.get('repo'), user = c.get('user');
  const limit = Math.min(20, Math.max(1, Number(c.req.query('limit') ?? 8)));
  const exclude = new Set((c.req.query('exclude') ?? '').split(',').filter(Boolean).slice(0, 200));
  const now = Date.now();
  const [pool, weights] = await Promise.all([repo.candidatePool(user, now), repo.loadWeights(user.id)]);
  const items = buildFeed(pool, weights, {
    now, limit, seen: exclude,
    lastTopic: c.req.query('lastTopic') || undefined, lastChannel: c.req.query('lastSource') || undefined,
  });
  return c.json({
    caughtUp: items.length === 0,
    items: items.map((i) => ({
      id: i.id, kind: i.kind, title: i.title, url: i.url, source: i.source, sourceId: i.channelId, sourceKind: i.sourceKind ?? 'youtube',
      topicId: i.topic, topicName: i.topicName, publishedAt: i.publishedAt,
      text: i.text, image: i.image, author: i.author, hook: i.hook,
    })),
  });
});

app.post('/api/views', async (c) => {
  const { views } = await c.req.json<{ views: { itemId: string; topicId: string; kind: string; ms: number }[] }>().catch(() => ({ views: [] }));
  const clean = (views ?? []).slice(0, 50).map((v) => ({
    itemId: String(v.itemId).slice(0, 300), topicId: Number(v.topicId) || 0,
    kind: v.kind === 'post' ? ('post' as const) : ('video' as const),
    ms: Math.max(0, Math.min(10 * 60_000, Number(v.ms) || 0)), // cap per report: 10 minutes
  })).filter((v) => v.itemId);
  await c.get('repo').recordViews(c.get('user').id, clean);
  return c.json({ ok: true });
});

app.post('/api/feedback', async (c) => {
  const f = await c.req.json<{ itemId: string; sourceId: string; topicId: string; rating: number }>();
  if (f.rating !== 1 && f.rating !== -1) return c.json({ error: 'rating must be 1 or -1' }, 400);
  const repo = c.get('repo'), uid = c.get('user').id;
  await repo.recordFeedback(uid, { itemId: f.itemId, sourceId: f.sourceId, topicId: Number(f.topicId), rating: f.rating });
  const w = applyFeedback(await repo.loadWeights(uid), { topic: String(f.topicId), channelId: f.sourceId, rating: f.rating });
  await repo.saveWeights(uid, w, { topic: String(f.topicId), channel: f.sourceId });
  return c.json({ ok: true });
});

// ---------- Creators ----------
app.get('/api/creators', async (c) => {
  const rows = await c.get('repo').sourcesFor(c.get('user').id);
  return c.json(rows.map((r) => ({ id: r.id, title: r.title, topicId: r.topic_id, thumb: r.thumb, reason: r.reason, kind: r.kind })));
});

app.post('/api/creators/hide', async (c) => {
  const { id } = await c.req.json<{ id: string }>();
  if (!id) return c.json({ error: 'id required' }, 400);
  await c.get('repo').block(c.get('user').id, String(id).slice(0, 300));
  return c.json({ ok: true });
});

// ---------- Library & thoughts ----------
function snapshot(raw: any): Snapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  let url = '';
  try { url = new URL(String(raw.url)).protocol === 'https:' ? String(raw.url) : ''; } catch { /* invalid */ }
  if (!url) return null;
  return {
    kind: raw.kind === 'post' ? 'post' : 'video', url,
    title: String(raw.title ?? '').slice(0, 300), source: String(raw.source ?? '').slice(0, 120),
    topicName: String(raw.topicName ?? '').slice(0, 60), text: raw.text ? String(raw.text).slice(0, 800) : undefined,
    image: raw.image ? String(raw.image).slice(0, 500) : null,
  };
}

app.get('/api/library', async (c) => c.json(await c.get('repo').library(c.get('user').id)));

app.post('/api/library/:list', async (c) => {
  const list = c.req.param('list');
  if (list !== 'saved' && list !== 'later') return c.json({ error: 'Unknown list' }, 404);
  const { itemId, item } = await c.req.json<{ itemId: string; item: unknown }>();
  const snap = snapshot(item);
  if (!itemId || !snap) return c.json({ error: 'itemId and item are required' }, 400);
  await c.get('repo').addToList(c.get('user').id, String(itemId).slice(0, 300), list, snap);
  return c.json({ ok: true });
});

app.delete('/api/library/:list', async (c) => {
  const list = c.req.param('list');
  if (list !== 'saved' && list !== 'later') return c.json({ error: 'Unknown list' }, 404);
  await c.get('repo').removeFromList(c.get('user').id, String(c.req.query('itemId') ?? ''), list);
  return c.json({ ok: true });
});

app.post('/api/notes', async (c) => {
  const { text, itemId, item } = await c.req.json<{ text: string; itemId?: string; item?: unknown }>();
  const clean = String(text ?? '').trim().slice(0, 4000);
  if (!clean) return c.json({ error: 'Write or say something first' }, 400);
  const id = await c.get('repo').addNote(c.get('user').id, clean, itemId ? String(itemId).slice(0, 300) : null, snapshot(item));
  return c.json({ ok: true, id });
});

app.delete('/api/notes/:id', async (c) => {
  await c.get('repo').deleteNote(c.get('user').id, Number(c.req.param('id')));
  return c.json({ ok: true });
});

// ---------- Insights ----------
app.get('/api/insights', async (c) => {
  const repo = c.get('repo'), user = c.get('user');
  const now = Date.now();
  const [views, totals] = await Promise.all([repo.viewsSince(user.id, now - 8 * 86_400_000), repo.totals(user.id)]);
  return c.json({ ...computeInsights(views, now, user.tz_offset), totals });
});

app.all('/api/*', (c) => c.json({ error: 'Not found' }, 404));

export default {
  fetch: app.fetch,
  async scheduled(_e: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(Promise.allSettled([refreshVideos(env), refreshReads(env)])
      .then((r) => console.log('refresh', JSON.stringify(r.map((x) => (x.status === 'fulfilled' ? x.value : String(x.reason)))))));
  },
} satisfies ExportedHandler<Env>;
