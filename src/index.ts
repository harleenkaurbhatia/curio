import { Hono } from 'hono';
import { hasSession, passcodeMatches, sessionCookie } from './auth';
import { Repo, type Mode } from './db';
import { buildFeed } from './core/ranking';
import { applyFeedback } from './core/feedback';
import { refresh, type Env } from './jobs/refresh';

const app = new Hono<{ Bindings: Env }>();
const MODES: Mode[] = ['catchup', 'learn', 'unwind'];

app.post('/api/login', async (c) => {
  const { passcode } = await c.req.json<{ passcode?: string }>().catch(() => ({ passcode: '' }));
  if (!c.env.APP_PASSCODE || !(await passcodeMatches(String(passcode ?? ''), c.env.APP_PASSCODE, c.env.SESSION_SECRET))) {
    await new Promise((r) => setTimeout(r, 800)); // slow down guessing
    return c.json({ error: 'Wrong passcode' }, 401);
  }
  c.header('Set-Cookie', await sessionCookie(c.env.SESSION_SECRET, new URL(c.req.url).protocol === 'https:'));
  return c.json({ ok: true });
});

app.use('/api/*', async (c, next) => {
  if (!(await hasSession(c.req.header('Cookie'), c.env.SESSION_SECRET))) return c.json({ error: 'Locked' }, 401);
  await next();
});

app.get('/api/feed', async (c) => {
  const repo = new Repo(c.env.DB);
  const limit = Math.min(20, Number(c.req.query('limit') ?? 8));
  const exclude = new Set((c.req.query('exclude') ?? '').split(',').filter(Boolean));
  const now = Date.now();
  const [pool, weights] = await Promise.all([repo.candidatePool(now), repo.loadWeights()]);
  const items = buildFeed(pool, weights, {
    now, limit, seen: exclude,
    lastTopic: c.req.query('lastTopic') || undefined, lastChannel: c.req.query('lastChannel') || undefined,
  });
  return c.json({
    caughtUp: items.length === 0,
    items: items.map(({ id, title, channelId, channelTitle, topic, topicName, publishedAt }) =>
      ({ id, title, channelId, channelTitle, topicId: topic, topicName, publishedAt })),
  });
});

app.post('/api/seen', async (c) => {
  const { ids } = await c.req.json<{ ids: string[] }>();
  await new Repo(c.env.DB).markSeen((ids ?? []).slice(0, 50).map(String));
  return c.json({ ok: true });
});

app.post('/api/feedback', async (c) => {
  const f = await c.req.json<{ videoId: string; channelId: string; topicId: string; rating: number }>();
  if (f.rating !== 1 && f.rating !== -1) return c.json({ error: 'rating must be 1 or -1' }, 400);
  const repo = new Repo(c.env.DB);
  await repo.recordFeedback({ videoId: f.videoId, channelId: f.channelId, topicId: Number(f.topicId), rating: f.rating });
  const w = applyFeedback(await repo.loadWeights(), { topic: String(f.topicId), channelId: f.channelId, rating: f.rating });
  await repo.saveWeights(w, { topic: String(f.topicId), channel: f.channelId });
  return c.json({ ok: true });
});

app.get('/api/topics', async (c) => c.json(await new Repo(c.env.DB).topics()));

app.post('/api/topics', async (c) => {
  const { name, mode } = await c.req.json<{ name: string; mode: Mode }>();
  const clean = String(name ?? '').trim().slice(0, 60);
  if (!clean || !MODES.includes(mode)) return c.json({ error: 'name and a valid mode are required' }, 400);
  try {
    await new Repo(c.env.DB).addTopic(clean, mode);
  } catch {
    return c.json({ error: 'That topic already exists' }, 409);
  }
  return c.json({ ok: true });
});

app.patch('/api/topics/:id', async (c) => {
  const { active } = await c.req.json<{ active: boolean }>();
  await new Repo(c.env.DB).setTopicActive(Number(c.req.param('id')), !!active);
  return c.json({ ok: true });
});

app.get('/api/channels', async (c) => {
  const rows = await new Repo(c.env.DB).channels('active');
  return c.json(rows.map(({ id, title, topic_id, thumb, language, score, reason }) => ({ id, title, topicId: topic_id, thumb, language, score, reason })));
});

app.delete('/api/channels/:id', async (c) => {
  await new Repo(c.env.DB).removeChannel(c.req.param('id'));
  return c.json({ ok: true });
});

app.post('/api/admin/refresh', async (c) => c.json(await refresh(c.env)));

export default {
  fetch: app.fetch,
  async scheduled(_e: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(refresh(env).then((r) => console.log('refresh', JSON.stringify(r))));
  },
} satisfies ExportedHandler<Env>;
